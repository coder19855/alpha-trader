import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  AutoEntryPreferenceState,
  canAutoEntryToday,
  consumeAutoEntryCloseR,
  loadAutoEntrySession,
  noteAutoEntryPositionR,
  recordAutoEntryDryRun,
  recordAutoEntryPlaced,
  recordAutoEntryTradeClosed,
  trackAutoEntryPositionPresence,
} from '@alpha-trader/server-preferences';
import {
  AutoExitDecisionSlice,
  AutoEntryGuardStatus,
  AutoEntryOrderResult,
  HeldDirection,
  PositionManagementContext,
  autoEntryStateKey,
  getAutoEntryRuntimeState,
  placeAutoEntryBuy,
  recordAutoEntryTraceEvent,
  setAutoEntryRuntimeState,
  simulateAutoEntryBuy,
} from '@alpha-trader/server-position';
import { TradingStyle } from '@alpha-trader/server-shared';

export type { AutoEntryGuardStatus };

export type AutoEntryPresetSignalResolver = (params: {
  fastify: FastifyInstance;
  pref: AutoEntryPreferenceState;
  decision: AutoExitDecisionSlice;
  style: TradingStyle;
  indexSymbol: string;
}) => Promise<{ action: HeldDirection; reason: string } | null>;

const ENTRY_COOLDOWN_MS = 120_000;
const CONFIRMATIONS_REQUIRED = 2;

function isTradeableAction(action: string): action is HeldDirection {
  return action === 'CE-BUY' || action === 'PE-BUY';
}

function signalIdentity(pref: AutoEntryPreferenceState, signal: {
  action: HeldDirection;
  reason: string;
}): string {
  return pref.signalMode === 'engine'
    ? `engine:${signal.action}`
    : `preset:${pref.signalProfile}:${signal.action}`;
}

function appendTrace(
  runtime: ReturnType<typeof getAutoEntryRuntimeState>,
  stateKey: string,
  event: Parameters<typeof recordAutoEntryTraceEvent>[1],
): void {
  recordAutoEntryTraceEvent(stateKey, event);
  runtime.recentEvents = getAutoEntryRuntimeState(stateKey).recentEvents;
  setAutoEntryRuntimeState(stateKey, runtime);
}

function buildGuardStatus(params: {
  pref: AutoEntryPreferenceState;
  session: Awaited<ReturnType<typeof loadAutoEntrySession>>;
  runtime: ReturnType<typeof getAutoEntryRuntimeState>;
  message: string;
  status: AutoEntryGuardStatus['status'];
}): AutoEntryGuardStatus {
  const { pref, session, runtime, message, status } = params;
  return {
    enabled: pref.enabled,
    dryRun: pref.dryRun,
    armedLive: pref.armedLive,
    signalMode: pref.signalMode,
    signalProfile: pref.signalProfile,
    entryThreshold: pref.entryThreshold,
    lots: pref.lots,
    maxEntriesPerDay: pref.maxEntriesPerDay,
    greenDayStop: pref.greenDayStop,
    entriesToday: session.entriesToday,
    dryRunsToday: session.dryRunsToday,
    greenDayLocked: session.greenDayLocked,
    confirmationCount: runtime.confirmationCount,
    confirmationsRequired: CONFIRMATIONS_REQUIRED,
    pendingAction: runtime.pendingAction,
    status,
    message,
    lastExecutedAt: runtime.lastExecutedAt,
    lastEvaluatedAt: runtime.lastEvaluatedAt,
    pendingReason: runtime.pendingReason,
    recentEvents: runtime.recentEvents,
  };
}

async function resolveEntrySignal(
  pref: AutoEntryPreferenceState,
  decision: AutoExitDecisionSlice,
  resolvePresetSignal?: AutoEntryPresetSignalResolver,
  presetContext?: {
    fastify: FastifyInstance;
    style: TradingStyle;
    indexSymbol: string;
  },
): Promise<{ action: HeldDirection; reason: string } | null> {
  if (pref.signalMode === 'engine') {
    if (!isTradeableAction(decision.action)) return null;
    if (decision.conviction < pref.entryThreshold) return null;
    return {
      action: decision.action,
      reason: `Engine ${decision.action} @ ${decision.conviction}% (≥ ${pref.entryThreshold}%)`,
    };
  }

  if (!resolvePresetSignal || !presetContext) return null;
  return resolvePresetSignal({
    fastify: presetContext.fastify,
    pref,
    decision: decision,
    style: presetContext.style,
    indexSymbol: presetContext.indexSymbol,
  });
}

export async function attachAutoEntryGuard(params: {
  fastify: FastifyInstance;
  indexSymbol: string;
  decision: AutoExitDecisionSlice;
  managementContext: PositionManagementContext;
  pref: AutoEntryPreferenceState;
  style: TradingStyle;
  execute?: boolean;
  resolvePresetSignal?: AutoEntryPresetSignalResolver;
}): Promise<AutoEntryGuardStatus> {
  const {
    fastify,
    indexSymbol,
    decision,
    managementContext,
    pref,
    style,
    execute = false,
    resolvePresetSignal,
  } = params;

  const session = await loadAutoEntrySession(fastify);
  const stateKey = autoEntryStateKey(indexSymbol);
  const runtime = { ...getAutoEntryRuntimeState(stateKey) };
  runtime.lastEvaluatedAt = new Date().toISOString();

  const closeTrack = trackAutoEntryPositionPresence(
    indexSymbol,
    Boolean(managementContext.hasOpenPosition),
  );
  if (managementContext.advice?.currentR != null) {
    noteAutoEntryPositionR(indexSymbol, managementContext.advice.currentR);
  }
  if (closeTrack.justClosed) {
    const closeR = consumeAutoEntryCloseR(indexSymbol) ?? 0;
    await recordAutoEntryTradeClosed(fastify, closeR, pref.greenDayStop);
  }

  if (!pref.enabled) {
    appendTrace(runtime, stateKey, {
      at: runtime.lastEvaluatedAt,
      stage: 'off',
      tone: 'neutral',
      title: 'Auto-entry off',
      detail: 'Enable auto-entry in Positions to start watching for entries.',
    });
    const guard = buildGuardStatus({
      pref,
      session,
      runtime,
      message:
        'Auto-entry off — enable in Positions tab to place MARKET buys on signal confirm.',
      status: 'off',
    });
    managementContext.autoEntry = guard;
    return guard;
  }

  if (managementContext.hasOpenPosition) {
    runtime.pendingKey = null;
    runtime.pendingAction = null;
    runtime.pendingReason = null;
    runtime.confirmationCount = 0;
    appendTrace(runtime, stateKey, {
      at: runtime.lastEvaluatedAt,
      stage: 'blocked',
      tone: 'warn',
      title: 'Blocked by open position',
      detail: 'Close the current index option leg before a new entry can be made.',
    });
    const guard = buildGuardStatus({
      pref,
      session: await loadAutoEntrySession(fastify),
      runtime,
      message: 'Auto-entry paused — close existing index option leg before new entry.',
      status: 'blocked',
    });
    managementContext.autoEntry = guard;
    setAutoEntryRuntimeState(stateKey, runtime);
    return guard;
  }

  const gate = canAutoEntryToday(pref, session);
  if (!gate.allowed) {
    appendTrace(runtime, stateKey, {
      at: runtime.lastEvaluatedAt,
      stage: 'blocked',
      tone: 'warn',
      title: 'Session blocked',
      detail: gate.reason ?? 'Session blocked for new entries.',
    });
    const guard = buildGuardStatus({
      pref,
      session,
      runtime,
      message: gate.reason ?? 'Session blocked for new entries.',
      status: 'blocked',
    });
    managementContext.autoEntry = guard;
    setAutoEntryRuntimeState(stateKey, runtime);
    return guard;
  }

  const signal = await resolveEntrySignal(
    pref,
    decision,
    resolvePresetSignal,
    { fastify, style, indexSymbol },
  );

  if (!signal) {
    runtime.pendingKey = null;
    runtime.pendingAction = null;
    runtime.pendingReason = null;
    runtime.confirmationCount = 0;
    appendTrace(runtime, stateKey, {
      at: runtime.lastEvaluatedAt,
      stage: 'watching',
      tone: 'neutral',
      title:
        pref.signalMode === 'engine'
          ? 'Watching PA engine'
          : `Watching preset ${pref.signalProfile}`,
      detail:
        pref.signalMode === 'engine'
          ? `Waiting for engine conviction to reach ${pref.entryThreshold}% or above.`
          : `Waiting for preset gates on ${pref.signalProfile}.`,
    });
    const hint =
      pref.signalMode === 'engine'
        ? `Watching engine — need ${pref.entryThreshold}%+ CE/PE signal.`
        : `Watching ${pref.signalProfile} — waiting for preset gates.`;
    const guard = buildGuardStatus({
      pref,
      session,
      runtime,
      message: hint,
      status: 'watching',
    });
    managementContext.autoEntry = guard;
    setAutoEntryRuntimeState(stateKey, runtime);
    return guard;
  }

  const key = signalIdentity(pref, signal);
  if (runtime.pendingKey === key) {
    runtime.confirmationCount += 1;
  } else {
    runtime.pendingKey = key;
    runtime.pendingAction = signal.action;
    runtime.pendingReason = signal.reason;
    runtime.confirmationCount = 1;
  }

  const ready = runtime.confirmationCount >= CONFIRMATIONS_REQUIRED;
  appendTrace(runtime, stateKey, {
    at: runtime.lastEvaluatedAt,
    stage: 'signal',
    tone: ready ? 'success' : 'neutral',
    title:
      runtime.confirmationCount >= CONFIRMATIONS_REQUIRED
        ? 'Signal confirmed'
        : 'Signal matched',
    detail: `${signal.action} · ${signal.reason} · confirmation ${runtime.confirmationCount}/${CONFIRMATIONS_REQUIRED}`,
  });

  const cooldownActive =
    runtime.lastExecutedAt != null &&
    Date.now() - new Date(runtime.lastExecutedAt).getTime() < ENTRY_COOLDOWN_MS;

  if (ready && execute && !cooldownActive) {
    if (!pref.dryRun && !pref.armedLive) {
      appendTrace(runtime, stateKey, {
        at: runtime.lastEvaluatedAt,
        stage: 'pending',
        tone: 'warn',
        title: 'Waiting for live arm',
        detail: 'Signal confirmed, but live orders are not armed yet.',
      });
      const guard = buildGuardStatus({
        pref,
        session,
        runtime,
        message: `Entry confirmed — arm live orders to place MARKET buy. ${signal.reason}`,
        status: 'pending',
      });
      managementContext.autoEntry = guard;
      setAutoEntryRuntimeState(stateKey, runtime);
      return guard;
    }

    const result: AutoEntryOrderResult = pref.dryRun
      ? await simulateAutoEntryBuy(fastify, {
          indexSymbol,
          direction: signal.action,
          lots: pref.lots,
          reason: signal.reason,
        })
      : await placeAutoEntryBuy(fastify, {
          indexSymbol,
          direction: signal.action,
          lots: pref.lots,
          reason: signal.reason,
        });

    runtime.lastExecutedAt = new Date().toISOString();
    runtime.lastExecutionNote = result.succeeded
      ? pref.dryRun
        ? `DRY-RUN: would buy ${pref.lots} lot(s) ${signal.action} @ ${result.symbol ?? 'ATM'} (qty ${result.qty}) — no broker order`
        : `Bought ${pref.lots} lot(s) ${signal.action} @ ${result.symbol ?? 'ATM'}`
      : result.error ?? 'Order failed';
    runtime.pendingKey = null;
    runtime.pendingAction = null;
    runtime.pendingReason = null;
    runtime.confirmationCount = 0;

    appendTrace(runtime, stateKey, {
      at: runtime.lastEvaluatedAt,
      stage: result.succeeded
        ? pref.dryRun
          ? 'simulated'
          : 'executed'
        : 'blocked',
      tone: result.succeeded ? 'success' : 'error',
      title: result.succeeded
        ? pref.dryRun
          ? 'Paper entry simulated'
          : 'Broker order placed'
        : 'Order failed',
      detail: runtime.lastExecutionNote ?? signal.reason,
    });

    if (result.succeeded) {
      if (pref.dryRun) {
        await recordAutoEntryDryRun(fastify);
      } else {
        await recordAutoEntryPlaced(fastify);
      }
    }

    const updatedSession = await loadAutoEntrySession(fastify);
    const guard = buildGuardStatus({
      pref,
      session: updatedSession,
      runtime,
      message: runtime.lastExecutionNote,
      status: result.succeeded
        ? pref.dryRun
          ? 'simulated'
          : 'executed'
        : 'pending',
    });
    managementContext.autoEntry = guard;
    setAutoEntryRuntimeState(stateKey, runtime);
    return guard;
  }

  if (cooldownActive) {
    appendTrace(runtime, stateKey, {
      at: runtime.lastEvaluatedAt,
      stage: 'cooldown',
      tone: 'warn',
      title: 'Cooldown active',
      detail: 'A confirmed entry just executed, so the next order is temporarily blocked.',
    });
  }

  const guard = buildGuardStatus({
    pref,
    session,
    runtime,
    message: ready
      ? cooldownActive
        ? `Entry confirmed — cooldown before next order. ${signal.reason}`
        : pref.dryRun
          ? `Entry confirmed (${runtime.confirmationCount}/${CONFIRMATIONS_REQUIRED}) — next poll will paper-trade. ${signal.reason}`
          : !pref.armedLive
            ? `Entry confirmed — arm live orders to execute. ${signal.reason}`
            : `Entry confirmed (${runtime.confirmationCount}/${CONFIRMATIONS_REQUIRED}) — next poll will place order. ${signal.reason}`
      : `Entry ${runtime.confirmationCount}/${CONFIRMATIONS_REQUIRED}: ${signal.reason}`,
    status: ready ? 'pending' : 'watching',
  });
  managementContext.autoEntry = guard;
  setAutoEntryRuntimeState(stateKey, runtime);
  return guard;
}