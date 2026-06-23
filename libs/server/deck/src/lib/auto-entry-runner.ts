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
import { isHardVetoReason } from '@alpha-trader/server-shared';
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
import { TradingStyle, getStyleScoringConfig } from '@alpha-trader/server-shared';

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
const GENERIC_DEFAULT_ENTRY_THRESHOLD = 60;
const ENTRY_THRESHOLD_HYSTERESIS_PCT = 5;

export function resolveEngineEntryThreshold(
  pref: AutoEntryPreferenceState,
  decision: AutoExitDecisionSlice,
  style: TradingStyle,
): number {
  const styleEnter =
    decision.tradeGuidance?.thresholdsForThisStyle?.enter ??
    getStyleScoringConfig(style).convictionThreshold.enter;
  // Align with deck entry % when the user has not customized the generic default.
  if (
    pref.entryThreshold === GENERIC_DEFAULT_ENTRY_THRESHOLD &&
    styleEnter !== GENERIC_DEFAULT_ENTRY_THRESHOLD
  ) {
    return styleEnter;
  }
  return pref.entryThreshold;
}

function resolveChartVetoReason(
  decision: AutoExitDecisionSlice,
): string | undefined {
  const overall = decision.priceAction?.overallSignal as
    | { vetoReason?: string }
    | undefined;
  const fromOverall =
    typeof overall?.vetoReason === 'string' ? overall.vetoReason : undefined;
  const reason =
    fromOverall ?? decision._debug?.rawPrice?.signal?.vetoReason ?? undefined;
  return isHardVetoReason(reason) ? reason : undefined;
}

function isNearEngineEntryThreshold(
  decision: AutoExitDecisionSlice,
  threshold: number,
): boolean {
  return (
    isTradeableAction(decision.action) &&
    decision.conviction >= threshold - ENTRY_THRESHOLD_HYSTERESIS_PCT
  );
}

export function isEngineEntryBlockedByVeto(
  pref: AutoEntryPreferenceState,
  decision: AutoExitDecisionSlice,
): boolean {
  return (
    pref.signalMode === 'engine' &&
    !pref.ignoreChartVeto &&
    Boolean(resolveChartVetoReason(decision))
  );
}

function describeEngineWatchDetail(
  decision: AutoExitDecisionSlice,
  threshold: number,
  ignoreChartVeto = false,
): string {
  const vetoReason = resolveChartVetoReason(decision);
  if (vetoReason && !ignoreChartVeto) {
    return `Chart veto active — ${vetoReason}`;
  }
  if (!isTradeableAction(decision.action)) {
    return `Need CE-BUY or PE-BUY (current: ${decision.action}).`;
  }
  if (decision.conviction < threshold) {
    return `Conviction ${decision.conviction}% below auto-entry threshold ${threshold}%.`;
  }
  return `Waiting for ${threshold}%+ on a tradeable engine signal.`;
}

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
  entryThreshold?: number;
}): AutoEntryGuardStatus {
  const { pref, session, runtime, message, status, entryThreshold } = params;
  return {
    enabled: pref.enabled,
    dryRun: pref.dryRun,
    armedLive: pref.armedLive,
    signalMode: pref.signalMode,
    signalProfile: pref.signalProfile,
    entryThreshold: entryThreshold ?? pref.entryThreshold,
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
  style: TradingStyle,
  resolvePresetSignal?: AutoEntryPresetSignalResolver,
  presetContext?: {
    fastify: FastifyInstance;
    style: TradingStyle;
    indexSymbol: string;
  },
): Promise<{ action: HeldDirection; reason: string } | null> {
  if (pref.signalMode === 'engine') {
    if (isEngineEntryBlockedByVeto(pref, decision)) return null;
    if (!isTradeableAction(decision.action)) return null;
    const threshold = resolveEngineEntryThreshold(pref, decision, style);
    if (decision.conviction < threshold) return null;
    return {
      action: decision.action,
      reason: `Engine ${decision.action} @ ${decision.conviction}% (≥ ${threshold}%)`,
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
  const effectiveEntryThreshold =
    pref.signalMode === 'engine'
      ? resolveEngineEntryThreshold(pref, decision, style)
      : pref.entryThreshold;
  const guardParams = {
    pref,
    session,
    runtime,
    entryThreshold: effectiveEntryThreshold,
  };

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
      ...guardParams,
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
      ...guardParams,
      session: await loadAutoEntrySession(fastify),
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
      ...guardParams,
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
    style,
    resolvePresetSignal,
    { fastify, style, indexSymbol },
  );

  if (!signal) {
    const holdConfirmation =
      pref.signalMode === 'engine' &&
      runtime.confirmationCount > 0 &&
      isNearEngineEntryThreshold(decision, effectiveEntryThreshold);
    if (!holdConfirmation) {
      runtime.pendingKey = null;
      runtime.pendingAction = null;
      runtime.pendingReason = null;
      runtime.confirmationCount = 0;
    }
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
          ? describeEngineWatchDetail(
              decision,
              effectiveEntryThreshold,
              pref.ignoreChartVeto,
            )
          : `Waiting for preset gates on ${pref.signalProfile}.`,
    });
    const hint =
      pref.signalMode === 'engine'
        ? `Watching engine — ${describeEngineWatchDetail(decision, effectiveEntryThreshold, pref.ignoreChartVeto)}`
        : `Watching ${pref.signalProfile} — waiting for preset gates.`;
    const guard = buildGuardStatus({
      ...guardParams,
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
        ...guardParams,
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
      ...guardParams,
      session: updatedSession,
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
    ...guardParams,
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