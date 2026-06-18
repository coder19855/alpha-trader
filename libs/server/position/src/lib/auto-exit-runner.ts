import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  BenchmarkExitPolicy,
  describeExitPolicy,
} from '@alpha-trader/server-analysis';
import { PriceActionResponse, RrLabel, TradeSetup } from '@alpha-trader/server-shared';
import { BenchmarkPositionPolicy } from './position-policy.js';
import { toManagementPriceData } from './management-decision-mapper.js';
import {
  syncScaleOutFromPeak,
  tickLiveTrailRuntime,
} from './auto-exit-live-trail.js';
import {
  evaluateBenchmarkAutoExitSignal,
  evaluateScaleOutSignal,
  resolveActiveTrailStopForDisplay,
  resolveTrailFloorForDisplay,
  updatePeakR,
} from './auto-exit-evaluator.js';
import {
  squareOffPartialWatchedIndexLegs,
  squareOffWatchedIndexLegs,
} from './auto-exit-executor.js';
import {
  autoExitStateKey,
  getAutoExitRuntimeState,
  setAutoExitRuntimeState,
} from './auto-exit-state.js';
import { resolveHeldPositionTradeSetup } from './held-position-trade-setup.js';
import { describePositionPolicy } from './position-policy.js';
import {
  AutoExitGuardStatus,
  HeldDirection,
  PositionManagementContext,
  PositionRrTracker,
} from './position-monitor.js';

export type { AutoExitGuardStatus };

export interface AutoExitGuardPreference {
  enabled: boolean;
  retestCount: number;
  signalFlipExit: boolean;
  exitPolicy: BenchmarkExitPolicy;
  positionPolicy: BenchmarkPositionPolicy;
}

export interface AutoExitDecisionSlice {
  action: string;
  conviction: number;
  lastPrice: number;
  tradeSetup?: TradeSetup | null;
  tradeGuidance?: {
    thresholdsForThisStyle?: { enter?: number };
  };
  priceAction?: {
    levels?: { support: number; resistance: number };
    overallSignal?: Record<string, unknown>;
  };
  momentumDecay?: { decayPercent: number; reasons?: string[] };
  momentumDecayPercent?: number | null;
  _debug?: { rawPrice?: PriceActionResponse };
}

const EXECUTION_COOLDOWN_MS = 120_000;

function trailStopLabel(hitLevel: string | null | undefined): string | null {
  if (!hitLevel) return null;
  if (hitLevel === 'CHANDELIER') return 'Chandelier';
  if (hitLevel === 'ATR_TIGHTEN') return 'ATR tighten';
  if (hitLevel === 'STRUCTURE_TRAIL') return 'Structure trail';
  if (hitLevel === 'TRAIL_FLOOR' || hitLevel === '1:1' || hitLevel === '1:1.5') {
    return 'R:R floor';
  }
  return 'Trail stop';
}

function buildGuardStatus(params: {
  pref: AutoExitGuardPreference;
  runtime: ReturnType<typeof getAutoExitRuntimeState>;
  message: string;
  status: AutoExitGuardStatus['status'];
  trailFloorPrice?: number | null;
  trailFloorR?: number | null;
  trailStopPrice?: number | null;
  trailStopLabel?: string | null;
  scaleOutNote?: string | null;
}): AutoExitGuardStatus {
  const confirmationsRequired = 1 + params.pref.retestCount;
  return {
    enabled: params.pref.enabled,
    retestCount: params.pref.retestCount,
    exitPolicy: params.pref.exitPolicy,
    positionPolicy: params.pref.positionPolicy,
    confirmationsRequired,
    confirmationCount: params.runtime.confirmationCount,
    pendingHitLevel: params.runtime.pendingHitLevel,
    peakR: params.runtime.peakR > 0 ? +params.runtime.peakR.toFixed(3) : null,
    trailFloorPrice: params.trailFloorPrice ?? null,
    trailFloorR: params.trailFloorR ?? null,
    trailStopPrice: params.trailStopPrice ?? null,
    trailStopLabel: params.trailStopLabel ?? null,
    scaleOutNote: params.scaleOutNote ?? null,
    status: params.status,
    message: params.message,
    lastExecutedAt: params.runtime.lastExecutedAt,
  };
}

function tradeSetupFromRrTracker(tracker: PositionRrTracker): TradeSetup | null {
  if (!tracker.entry || !tracker.stopLoss || tracker.risk <= 0) {
    return null;
  }
  const takeProfits = tracker.levels
    .filter((level) => level.kind === 'tp')
    .map((level) => ({
      rr: level.label as RrLabel,
      price: level.price,
      multiplier: level.rr,
    }));
  return {
    entry: tracker.entry,
    stopLoss: tracker.stopLoss,
    rawStopLoss: tracker.stopLoss,
    risk: tracker.risk,
    takeProfits,
    atrUsed: 0,
    stopAdjusted: false,
  };
}

function resolveTradeSetup(
  heldDirection: HeldDirection,
  decision: AutoExitDecisionSlice,
  entrySpot?: number | null,
): TradeSetup | null {
  const rawPrice = decision._debug?.rawPrice;
  const shell = rawPrice
    ? { ...rawPrice, lastPrice: decision.lastPrice }
    : ({
        lastPrice: decision.lastPrice,
        tradeSetup: decision.tradeSetup ?? undefined,
        levels: decision.priceAction?.levels,
        signal: decision.priceAction?.overallSignal,
      } as PriceActionResponse);
  const priceData = toManagementPriceData(shell);
  return (
    resolveHeldPositionTradeSetup(heldDirection, priceData, {
      entrySpot: entrySpot ?? undefined,
    }) ?? null
  );
}

function formatExecutionNote(
  result: Awaited<ReturnType<typeof squareOffWatchedIndexLegs>>,
): string {
  const parts: string[] = [];
  if (result.succeeded > 0) {
    parts.push(`Squared off ${result.succeeded}/${result.attempted} leg(s).`);
  }
  if (result.skipped?.length) {
    parts.push(result.skipped.join(' '));
  }
  if (result.failed.length) {
    parts.push(result.failed.join('; '));
  }
  return parts.join(' ') || 'Square-off failed';
}

/**
 * Lightweight live refresh for deck exit-map UI — updates spot, current R, peak R,
 * and trail stop display from websocket index price without a full positions REST cycle.
 */
export function refreshAutoExitGuardDisplay(params: {
  indexSymbol: string;
  managementContext: PositionManagementContext;
  spot: number;
  pref?: AutoExitGuardPreference;
}): PositionManagementContext {
  const { indexSymbol, spot } = params;
  const pref = params.pref;
  const ctx = params.managementContext;
  const tracker = ctx.advice?.rrTracker;
  const heldDirection = ctx.heldDirection ?? tracker?.direction ?? null;

  if (!tracker || !heldDirection || tracker.risk <= 0) {
    return ctx;
  }

  let currentR: number | null = null;
  if (heldDirection === 'CE-BUY') {
    currentR = (spot - tracker.entry) / tracker.risk;
  } else if (heldDirection === 'PE-BUY') {
    currentR = (tracker.entry - spot) / tracker.risk;
  }

  const nextAdvice = {
    ...ctx.advice!,
    currentR,
    rrTracker: { ...tracker, spot, currentR },
  };

  if (!ctx.autoExit?.enabled || ctx.autoExit.status === 'off') {
    return { ...ctx, advice: nextAdvice };
  }

  if (!pref) {
    return { ...ctx, advice: nextAdvice };
  }

  const tradeSetup = tradeSetupFromRrTracker(tracker);
  if (!tradeSetup) {
    return { ...ctx, advice: nextAdvice };
  }

  const stateKey = autoExitStateKey(indexSymbol, heldDirection);
  const runtime = { ...getAutoExitRuntimeState(stateKey) };

  runtime.peakR = updatePeakR(heldDirection, spot, tradeSetup, runtime.peakR);
  tickLiveTrailRuntime({
    heldDirection,
    spot,
    tradeSetup,
    peakR: runtime.peakR,
    exitPolicy: pref.exitPolicy,
    positionPolicy: pref.positionPolicy,
    runtime,
  });

  const activeTrail = resolveActiveTrailStopForDisplay(
    heldDirection,
    tradeSetup,
    runtime.peakR,
    pref.exitPolicy,
    runtime.chandelier,
    runtime.structure,
  );
  const rrFloor = resolveTrailFloorForDisplay(
    heldDirection,
    tradeSetup,
    runtime.peakR,
  );

  const scaleOutNote =
    runtime.scaleOut && runtime.scaleOut.tiersBanked > 0
      ? `Scale-out active · ${(runtime.scaleOut.remainingFraction * 100).toFixed(0)}% runner · banked ${runtime.scaleOut.bankedR.toFixed(2)}R`
      : ctx.autoExit.scaleOutNote;

  const stopNote = activeTrail
    ? ` · ${trailStopLabel(activeTrail.hitLevel)} ${activeTrail.stopPrice.toFixed(2)}`
    : rrFloor
      ? ` · R:R floor ${rrFloor.floorPrice.toFixed(2)}`
      : '';

  const autoExit: AutoExitGuardStatus = {
    ...ctx.autoExit,
    peakR: runtime.peakR > 0 ? +runtime.peakR.toFixed(3) : null,
    trailFloorPrice: activeTrail?.trailFloorPrice ?? rrFloor?.floorPrice ?? null,
    trailFloorR: activeTrail?.trailFloorR ?? rrFloor?.floorR ?? null,
    trailStopPrice: activeTrail?.stopPrice ?? null,
    trailStopLabel: trailStopLabel(activeTrail?.hitLevel),
    scaleOutNote,
    message:
      ctx.autoExit.status === 'watching' ||
      ctx.autoExit.status === 'pending' ||
      ctx.autoExit.status === 'blocked'
        ? `Watching ${pref.exitPolicy} · peak ${runtime.peakR.toFixed(2)}R${stopNote}`
        : ctx.autoExit.message,
  };

  setAutoExitRuntimeState(stateKey, runtime);

  return {
    ...ctx,
    advice: nextAdvice,
    autoExit,
  };
}

export async function attachAutoExitGuard(params: {
  fastify: FastifyInstance;
  indexSymbol: string;
  decision: AutoExitDecisionSlice;
  managementContext: PositionManagementContext;
  pref: AutoExitGuardPreference;
  entrySpot?: number | null;
  execute?: boolean;
}): Promise<AutoExitGuardStatus> {
  const {
    fastify,
    indexSymbol,
    decision,
    managementContext,
    pref,
    entrySpot,
    execute = false,
  } = params;

  if (!pref.enabled) {
    const guard = buildGuardStatus({
      pref,
      runtime: getAutoExitRuntimeState('disabled'),
      message:
        'Auto-exit off — enable in Positions tab to apply benchmark exit rules on live legs.',
      status: 'off',
    });
    managementContext.autoExit = guard;
    return guard;
  }

  const heldDirection = managementContext.heldDirection ?? null;
  const isMixed = Boolean(managementContext.isMixedDirections);

  if (!heldDirection || isMixed || !managementContext.hasOpenPosition) {
    const guard = buildGuardStatus({
      pref,
      runtime: getAutoExitRuntimeState(autoExitStateKey(indexSymbol, 'mixed')),
      message: isMixed
        ? 'Auto-exit paused — close or reduce to one direction (mixed CE+PE not supported).'
        : 'Auto-exit armed — waiting for an open CE or PE leg on this index.',
      status: 'blocked',
    });
    managementContext.autoExit = guard;
    return guard;
  }

  const tradeSetup = resolveTradeSetup(heldDirection, decision, entrySpot);
  const stateKey = autoExitStateKey(indexSymbol, heldDirection);
  const runtime = { ...getAutoExitRuntimeState(stateKey) };

  if (!tradeSetup?.entry || !tradeSetup.stopLoss || tradeSetup.risk <= 0) {
    const guard = buildGuardStatus({
      pref,
      runtime,
      message:
        'Auto-exit armed — waiting for index entry/stop levels from the engine.',
      status: 'watching',
    });
    managementContext.autoExit = guard;
    setAutoExitRuntimeState(stateKey, runtime);
    return guard;
  }

  const spot = decision.lastPrice;
  if (
    runtime.activeExitPolicy !== pref.exitPolicy ||
    runtime.activePositionPolicy !== pref.positionPolicy
  ) {
    runtime.chandelier = null;
    runtime.structure = null;
    runtime.scaleOut = null;
    runtime.lastSpot = null;
    runtime.runningAtr = 0;
    runtime.activeExitPolicy = pref.exitPolicy;
    runtime.activePositionPolicy = pref.positionPolicy;
  }

  runtime.peakR = updatePeakR(heldDirection, spot, tradeSetup, runtime.peakR);
  tickLiveTrailRuntime({
    heldDirection,
    spot,
    tradeSetup,
    peakR: runtime.peakR,
    exitPolicy: pref.exitPolicy,
    positionPolicy: pref.positionPolicy,
    runtime,
  });

  const activeTrail = resolveActiveTrailStopForDisplay(
    heldDirection,
    tradeSetup,
    runtime.peakR,
    pref.exitPolicy,
    runtime.chandelier,
    runtime.structure,
  );
  const rrFloor = resolveTrailFloorForDisplay(
    heldDirection,
    tradeSetup,
    runtime.peakR,
  );
  const enterThreshold =
    decision.tradeGuidance?.thresholdsForThisStyle?.enter ?? 60;
  const momentumDecayPercent =
    decision.momentumDecay?.decayPercent ??
    decision.momentumDecayPercent ??
    null;

  const scaleOutNote =
    runtime.scaleOut && runtime.scaleOut.tiersBanked > 0
      ? `Scale-out active · ${(runtime.scaleOut.remainingFraction * 100).toFixed(0)}% runner · banked ${runtime.scaleOut.bankedR.toFixed(2)}R`
      : null;

  runtime.lastEvaluatedAt = new Date().toISOString();

  const scaleSignal = evaluateScaleOutSignal({
    heldDirection,
    peakR: runtime.peakR,
    tradeSetup,
    exitPolicy: pref.exitPolicy,
    positionPolicy: pref.positionPolicy,
    scaleOut: runtime.scaleOut,
  });

  if (scaleSignal?.partialFraction != null && execute) {
    const cooldownActive =
      runtime.lastExecutedAt != null &&
      Date.now() - new Date(runtime.lastExecutedAt).getTime() <
        EXECUTION_COOLDOWN_MS;
    if (!cooldownActive) {
      const result = await squareOffPartialWatchedIndexLegs(fastify, {
        indexSymbol,
        heldDirection,
        reason: scaleSignal.reason,
        fraction: scaleSignal.partialFraction,
      });
      syncScaleOutFromPeak(runtime.peakR, tradeSetup, runtime.scaleOut);
      runtime.lastExecutedAt = new Date().toISOString();
      runtime.lastExecutionNote = formatExecutionNote(result);
      const guard = buildGuardStatus({
        pref,
        runtime,
        message: `${runtime.lastExecutionNote} · ${scaleSignal.reason}`,
        status: result.succeeded > 0 ? 'executed' : 'pending',
        trailFloorPrice: activeTrail?.trailFloorPrice ?? rrFloor?.floorPrice ?? null,
        trailFloorR: activeTrail?.trailFloorR ?? rrFloor?.floorR ?? null,
        trailStopPrice: activeTrail?.stopPrice ?? null,
        trailStopLabel: trailStopLabel(activeTrail?.hitLevel),
        scaleOutNote,
      });
      managementContext.autoExit = guard;
      setAutoExitRuntimeState(stateKey, runtime);
      return guard;
    }
  }

  const signal = evaluateBenchmarkAutoExitSignal({
    heldDirection,
    spot,
    peakR: runtime.peakR,
    tradeSetup,
    engineAction: decision.action,
    engineConviction: decision.conviction,
    enterThreshold,
    signalFlipExit: pref.signalFlipExit,
    exitPolicy: pref.exitPolicy,
    positionPolicy: pref.positionPolicy,
    chandelier: runtime.chandelier,
    structure: runtime.structure,
    scaleOut: runtime.scaleOut,
    momentumDecayPercent,
  });

  const policyHint = describeExitPolicy(pref.exitPolicy);
  const positionHint =
    pref.positionPolicy === 'scale-ladder'
      ? describePositionPolicy('scale-ladder')
      : null;

  if (!signal) {
    runtime.pendingHitLevel = null;
    runtime.confirmationCount = 0;
    runtime.lastReason = null;
    const stopNote = activeTrail
      ? ` · ${trailStopLabel(activeTrail.hitLevel)} ${activeTrail.stopPrice.toFixed(2)}`
      : rrFloor
        ? ` · R:R floor ${rrFloor.floorPrice.toFixed(2)}`
        : '';
    const guard = buildGuardStatus({
      pref,
      runtime,
      message: `Watching ${pref.exitPolicy} · peak ${runtime.peakR.toFixed(2)}R${stopNote}.${positionHint ? ` ${positionHint}` : ''}`,
      status: 'watching',
      trailFloorPrice: activeTrail?.trailFloorPrice ?? rrFloor?.floorPrice ?? null,
      trailFloorR: activeTrail?.trailFloorR ?? rrFloor?.floorR ?? null,
      trailStopPrice: activeTrail?.stopPrice ?? null,
      trailStopLabel: trailStopLabel(activeTrail?.hitLevel),
      scaleOutNote,
    });
    managementContext.autoExit = guard;
    setAutoExitRuntimeState(stateKey, runtime);
    return guard;
  }

  const confirmationsRequired = signal.immediate ? 1 : 1 + pref.retestCount;
  if (
    runtime.pendingHitLevel === signal.hitLevel &&
    runtime.lastReason === signal.reason
  ) {
    runtime.confirmationCount += 1;
  } else {
    runtime.pendingHitLevel = signal.hitLevel;
    runtime.lastReason = signal.reason;
    runtime.confirmationCount = 1;
  }

  const ready = runtime.confirmationCount >= confirmationsRequired;
  const cooldownActive =
    runtime.lastExecutedAt != null &&
    Date.now() - new Date(runtime.lastExecutedAt).getTime() < EXECUTION_COOLDOWN_MS;

  if (ready && execute && !cooldownActive) {
    const result = await squareOffWatchedIndexLegs(fastify, {
      indexSymbol,
      heldDirection,
      reason: signal.reason,
    });
    runtime.lastExecutedAt = new Date().toISOString();
    runtime.lastExecutionNote = formatExecutionNote(result);
    runtime.pendingHitLevel = null;
    runtime.confirmationCount = 0;
    runtime.peakR = 0;
    runtime.chandelier = null;
    runtime.structure = null;
    runtime.scaleOut = null;
    runtime.lastSpot = null;
    runtime.runningAtr = 0;

    const guard = buildGuardStatus({
      pref,
      runtime,
      message: `${runtime.lastExecutionNote} · ${signal.reason}`,
      status: 'executed',
      trailFloorPrice: activeTrail?.trailFloorPrice ?? rrFloor?.floorPrice ?? null,
      trailFloorR: activeTrail?.trailFloorR ?? rrFloor?.floorR ?? null,
      trailStopPrice: activeTrail?.stopPrice ?? null,
      trailStopLabel: trailStopLabel(activeTrail?.hitLevel),
      scaleOutNote,
    });
    managementContext.autoExit = guard;
    setAutoExitRuntimeState(stateKey, runtime);
    return guard;
  }

  const guard = buildGuardStatus({
    pref,
    runtime,
    message: ready
      ? cooldownActive
        ? `Exit confirmed — cooldown before next auto-close. ${signal.reason}`
        : `Exit confirmed (${runtime.confirmationCount}/${confirmationsRequired}) — next poll will square off. ${signal.reason}`
      : `Exit ${runtime.confirmationCount}/${confirmationsRequired}${signal.immediate ? '' : ` (+${pref.retestCount} retests)`}: ${signal.reason} · ${policyHint}`,
    status: 'pending',
    trailFloorPrice: activeTrail?.trailFloorPrice ?? rrFloor?.floorPrice ?? null,
    trailFloorR: activeTrail?.trailFloorR ?? rrFloor?.floorR ?? null,
    trailStopPrice: activeTrail?.stopPrice ?? null,
    trailStopLabel: trailStopLabel(activeTrail?.hitLevel),
    scaleOutNote,
  });
  managementContext.autoExit = guard;
  setAutoExitRuntimeState(stateKey, runtime);
  return guard;
}