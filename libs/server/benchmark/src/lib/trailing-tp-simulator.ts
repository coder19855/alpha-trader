import { FyersAPI } from 'fyers-api-v3';
import {
  RrLabel,
  TradeAction,
  TradeOutcome,
  TradeSetup,
  TradeTakeProfitLevel,
} from '@alpha-trader/server-shared';
import {
  FLIP_EXIT_MIN_PEAK_R,
  SESSION_END_TIGHTEN_CURRENT_R,
  SESSION_END_TIGHTEN_MINUTES,
  SESSION_END_TIGHTEN_PEAK_R,
} from '@alpha-trader/server-shared';
import { getNseSessionCloseSec, toIso } from '@alpha-trader/server-analysis';
import {
  CHANDELIER_DEFAULT_ATR_MULT,
  CHANDELIER_DEFAULT_PERIOD,
  CHANDELIER_HYBRID_MIN_PEAK_R,
  BenchmarkExitPolicy,
  ChandelierState,
  initChandelierState,
  isCloseThroughStop,
  resolveChandelierMultiplier,
  trueRange,
  updateChandelierState,
  updateWilderAtr,
  usesChandelierTrail,
} from '@alpha-trader/server-analysis';
import {
  BenchmarkPositionPolicy,
  ScaleOutState,
  blendedScaleOutPnl,
  blendedScaleOutPnlR,
  hasScaleOutActivity,
  initScaleOutState,
  scaleOutHitLevel,
  updateScaleOutOnTierTouch,
} from '@alpha-trader/server-position';
import {
  MOMENTUM_EXIT_DECAY_THRESHOLD,
  MOMENTUM_EXIT_MIN_PEAK_R,
  computeSimMomentumDecayPercent,
} from '@alpha-trader/server-analysis';
import {
  StructureTrailState,
  initStructureTrailState,
  updateStructureTrailState,
} from '@alpha-trader/server-analysis';
import {
  exitRAtPrice,
  resolveTrailStop,
} from '@alpha-trader/server-analysis';
import {
  favorableR,
  floorPriceFromR,
  resolveTrailFloorR,
  signedR,
} from '@alpha-trader/server-analysis';

export type { FlipExitSignal } from '@alpha-trader/server-analysis';
import type { FlipExitSignal } from '@alpha-trader/server-analysis';

export interface TrailingFloorSimOptions {
  flipExits?: FlipExitSignal[];
  enableFlipExit?: boolean;
  exitPolicy?: BenchmarkExitPolicy;
  positionPolicy?: BenchmarkPositionPolicy;
  chandelierPeriod?: number;
  chandelierMultiplier?: number;
  chandelierHybridMinPeakR?: number;
}

type TpTier = 0 | 1 | 2 | 3;

function signedPnl(
  action: TradeAction,
  entry: number,
  exitPrice: number,
): number {
  if (action === 'CE-BUY') return +(exitPrice - entry).toFixed(2);
  if (action === 'PE-BUY') return +(entry - exitPrice).toFixed(2);
  return 0;
}

function sortedTakeProfits(setup: TradeSetup): TradeTakeProfitLevel[] {
  return [...setup.takeProfits].sort((a, b) => a.multiplier - b.multiplier);
}

function maxTierTouchedOnCandle(
  action: TradeAction,
  tiers: TradeTakeProfitLevel[],
  high: number,
  low: number,
): TpTier {
  let max: TpTier = 0;
  tiers.forEach((tp, index) => {
    const hit =
      action === 'CE-BUY' ? high >= tp.price : low <= tp.price;
    if (hit) {
      const tier = (index + 1) as TpTier;
      if (tier > max) max = tier;
    }
  });
  return max;
}

function tierLevel(tiers: TradeTakeProfitLevel[], tier: 1 | 2 | 3) {
  return tiers[tier - 1] ?? null;
}

function peakRFromCandle(
  action: TradeAction,
  entry: number,
  risk: number,
  high: number,
  low: number,
): number {
  const favorable =
    action === 'CE-BUY' ? favorableR(action, high, entry, risk) : favorableR(action, low, entry, risk);
  return favorable;
}

/**
 * Trail with tier locks (1:1.5 → 1:2.5 → 1:4), Chandelier ATR, or hybrid.
 * No auto-exit at 1:4; hold until trail stop, flip, SL, or session end.
 */
function trailStopExit(
  action: TradeAction,
  setup: TradeSetup,
  peakR: number,
  close: number,
  tsMs: number,
  barsHeld: number,
  chandelier: ChandelierState | null,
  structure: StructureTrailState | null,
  exitPolicy: BenchmarkExitPolicy,
  hybridMinPeakR: number,
  scaleOut: ScaleOutState | null,
  withScope: (outcome: TradeOutcome) => TradeOutcome,
): TradeOutcome | null {
  const trail = resolveTrailStop(
    action,
    setup,
    peakR,
    chandelier,
    structure,
    exitPolicy,
    hybridMinPeakR,
  );
  if (!trail || !isCloseThroughStop(action, trail.stopPrice, close)) {
    return null;
  }

  const scaled = hasScaleOutActivity(scaleOut);
  const pnlR = scaled
    ? blendedScaleOutPnlR(scaleOut!, trail.exitR)
    : +trail.exitR.toFixed(3);
  const pnl = scaled
    ? blendedScaleOutPnl(
        action,
        setup.entry,
        setup.risk,
        scaleOut!,
        trail.stopPrice,
      )
    : signedPnl(action, setup.entry, trail.stopPrice);
  const hitLevel = scaleOutHitLevel(scaleOut, trail.hitLevel);

  return withScope({
    status: 'TAKE_PROFIT',
    pnl,
    pnlR,
    exitPrice: trail.stopPrice,
    exitAt: tsMs,
    exitAtISO: toIso(tsMs),
    hitLevel,
    barsHeld,
  });
}

function momentumDecayExit(
  action: TradeAction,
  setup: TradeSetup,
  peakR: number,
  close: number,
  tsMs: number,
  barsHeld: number,
  candles: FyersAPI.Candle[],
  candleIndex: number,
  scaleOut: ScaleOutState | null,
  withScope: (outcome: TradeOutcome) => TradeOutcome,
): TradeOutcome | null {
  if (peakR < MOMENTUM_EXIT_MIN_PEAK_R) return null;
  const decay = computeSimMomentumDecayPercent(candles, candleIndex, action);
  if (decay < MOMENTUM_EXIT_DECAY_THRESHOLD) return null;

  const remainderR = exitRAtPrice(action, setup.entry, setup.risk, close);
  const pnlR = hasScaleOutActivity(scaleOut)
    ? blendedScaleOutPnlR(scaleOut!, remainderR)
    : remainderR;
  const pnl = hasScaleOutActivity(scaleOut)
    ? blendedScaleOutPnl(action, setup.entry, setup.risk, scaleOut!, close)
    : signedPnl(action, setup.entry, close);

  return withScope({
    status: pnlR > 0.05 ? 'TAKE_PROFIT' : 'SESSION_END',
    pnl,
    pnlR,
    exitPrice: +close.toFixed(2),
    exitAt: tsMs,
    exitAtISO: toIso(tsMs),
    hitLevel: 'MOMENTUM_DECAY',
    barsHeld,
  });
}

function highestTouchedLabel(
  tiers: TradeTakeProfitLevel[],
  peakTier: TpTier,
): RrLabel | 'SESSION_END' | 'OPEN' {
  if (peakTier >= 3) return tierLevel(tiers, 3)!.rr;
  if (peakTier >= 2) return tierLevel(tiers, 2)!.rr;
  if (peakTier >= 1) return tierLevel(tiers, 1)!.rr;
  return 'OPEN';
}

const MEANINGFUL_PEAK_R = 0.35;

function isInSessionTightenWindow(tsSec: number, sessionCloseSec: number): boolean {
  const windowSec = SESSION_END_TIGHTEN_MINUTES * 60;
  return tsSec >= sessionCloseSec - windowSec && tsSec <= sessionCloseSec;
}

function sessionTightenExit(
  action: TradeAction,
  entry: number,
  risk: number,
  peakR: number,
  close: number,
  tsMs: number,
  barsHeld: number,
  withScope: (outcome: TradeOutcome) => TradeOutcome,
): TradeOutcome | null {
  if (peakR < SESSION_END_TIGHTEN_PEAK_R) return null;

  const currentR = signedR(action, close, entry, risk);
  const giveback = Math.max(0, peakR - currentR);
  const floorR = resolveTrailFloorR(peakR);
  const floorPrice =
    floorR != null ? floorPriceFromR(action, entry, risk, floorR) : null;
  const floorBreached =
    floorPrice != null &&
    (action === 'CE-BUY' ? close < floorPrice : close > floorPrice);

  const proactiveFade =
    currentR >= 1 && giveback >= 0.25 && !floorBreached;
  const lateFade =
    currentR > 0.05 &&
    currentR <= SESSION_END_TIGHTEN_CURRENT_R &&
    giveback >= 0.35 &&
    !floorBreached;

  if (!proactiveFade && !lateFade) return null;

  const pnl = signedPnl(action, entry, close);
  return withScope({
    status: currentR > 0.05 ? 'TAKE_PROFIT' : 'SESSION_END',
    pnl,
    pnlR: currentR,
    exitPrice: +close.toFixed(2),
    exitAt: tsMs,
    exitAtISO: toIso(tsMs),
    hitLevel: 'SESSION_TIGHTEN',
    barsHeld,
  });
}

function attachExcursion(
  outcome: TradeOutcome,
  peakR: number,
  maxAdverseR: number,
): TradeOutcome {
  const givebackR =
    peakR >= MEANINGFUL_PEAK_R
      ? +Math.max(0, peakR - outcome.pnlR).toFixed(3)
      : 0;
  return {
    ...outcome,
    peakR: +peakR.toFixed(3),
    maxAdverseR: +maxAdverseR.toFixed(3),
    givebackR,
  };
}

function updateExcursionOnCandle(
  action: TradeAction,
  entry: number,
  risk: number,
  high: number,
  low: number,
  tiers: TradeTakeProfitLevel[],
  state: { peakR: number; maxAdverseR: number; peakTier: TpTier },
): void {
  const adversePrice = action === 'CE-BUY' ? low : high;
  state.maxAdverseR = Math.min(
    state.maxAdverseR,
    signedR(action, adversePrice, entry, risk),
  );
  state.peakR = Math.max(
    state.peakR,
    peakRFromCandle(action, entry, risk, high, low),
  );
  const touched = maxTierTouchedOnCandle(action, tiers, high, low);
  if (touched > state.peakTier) state.peakTier = touched;
}

export function simulateTradeOutcomeWithTrailingFloor(
  action: TradeAction,
  setup: TradeSetup | undefined,
  forwardCandles: FyersAPI.Candle[],
  simulationScope: 'session' | 'window' = 'session',
  options?: TrailingFloorSimOptions,
): TradeOutcome {
  if (action === 'NO-TRADE' || !setup) {
    return {
      status: 'NO-TRADE',
      pnl: 0,
      pnlR: 0,
      exitPrice: 0,
      barsHeld: 0,
      hitLevel: 'OPEN',
      simulationScope,
    };
  }

  const { entry, stopLoss, risk } = setup;
  const tiers = sortedTakeProfits(setup);

  if (forwardCandles.length === 0) {
    return {
      status: simulationScope === 'session' ? 'SESSION_END' : 'OPEN',
      pnl: 0,
      pnlR: 0,
      exitPrice: entry,
      hitLevel: simulationScope === 'session' ? 'SESSION_END' : 'OPEN',
      barsHeld: 0,
      simulationScope,
    };
  }

  const withScope = (outcome: TradeOutcome): TradeOutcome =>
    attachExcursion(
      { ...outcome, simulationScope },
      excursion.peakR,
      excursion.maxAdverseR,
    );

  const excursion = { peakR: 0, maxAdverseR: 0, peakTier: 0 as TpTier };
  let peakTier: TpTier = 0;
  let peakR = 0;
  const flipExits = options?.flipExits ?? [];
  const enableFlipExit = options?.enableFlipExit !== false;
  const exitPolicy: BenchmarkExitPolicy = options?.exitPolicy ?? 'rr-ladder';
  const positionPolicy: BenchmarkPositionPolicy =
    options?.positionPolicy ?? 'flat';
  const chandelierPeriod = options?.chandelierPeriod ?? CHANDELIER_DEFAULT_PERIOD;
  const chandelierMultiplier =
    options?.chandelierMultiplier ?? CHANDELIER_DEFAULT_ATR_MULT;
  const hybridMinPeakR =
    options?.chandelierHybridMinPeakR ?? CHANDELIER_HYBRID_MIN_PEAK_R;
  const seedAtr = setup.atrUsed > 0 ? setup.atrUsed : risk;
  let chandelier: ChandelierState | null = usesChandelierTrail(exitPolicy)
    ? initChandelierState(action, entry, seedAtr, chandelierMultiplier)
    : null;
  let structure: StructureTrailState | null =
    exitPolicy === 'structure-trail'
      ? initStructureTrailState(action, entry, seedAtr)
      : null;
  const scaleOut = initScaleOutState(positionPolicy, exitPolicy);
  let flipIdx = 0;
  let prevClose = entry;
  let runningAtr = seedAtr;
  const sessionCloseSec =
    simulationScope === 'session'
      ? getNseSessionCloseSec(forwardCandles[0][0])
      : null;

  for (let i = 0; i < forwardCandles.length; i += 1) {
    const candle = forwardCandles[i];
    const [, , high, low, close] = candle;
    const tsMs = candle[0] * 1000;
    const tsSec = candle[0];
    const lockedPeakR = peakR;

    if (chandelier) {
      const mult = resolveChandelierMultiplier(
        exitPolicy,
        lockedPeakR,
        chandelierMultiplier,
      );
      chandelier = updateChandelierState(
        action,
        chandelier,
        high,
        low,
        prevClose,
        chandelierPeriod,
        mult,
      );
      runningAtr = chandelier.atr;
    }
    if (!chandelier) {
      runningAtr = updateWilderAtr(
        runningAtr,
        trueRange(high, low, prevClose),
        chandelierPeriod,
      );
    }
    if (structure) {
      structure = updateStructureTrailState(
        action,
        structure,
        high,
        low,
        runningAtr,
        peakR,
      );
    }
    prevClose = close;
    updateExcursionOnCandle(action, entry, risk, high, low, tiers, excursion);

    if (scaleOut) {
      const touched = maxTierTouchedOnCandle(action, tiers, high, low);
      updateScaleOutOnTierTouch(scaleOut, touched, tiers);
    }
    peakTier = excursion.peakTier;
    peakR = excursion.peakR;

    while (flipIdx < flipExits.length && flipExits[flipIdx].tsMs <= tsMs) {
      const flip = flipExits[flipIdx];
      flipIdx += 1;
      const inProfitBand = lockedPeakR >= FLIP_EXIT_MIN_PEAK_R;
      const isOpposite =
        (action === 'CE-BUY' && flip.oppositeAction === 'PE-BUY') ||
        (action === 'PE-BUY' && flip.oppositeAction === 'CE-BUY');
      if (enableFlipExit && inProfitBand && isOpposite) {
        const remainderR = exitRAtPrice(action, entry, risk, close);
        const pnlR = hasScaleOutActivity(scaleOut)
          ? blendedScaleOutPnlR(scaleOut!, remainderR)
          : remainderR;
        const pnl = hasScaleOutActivity(scaleOut)
          ? blendedScaleOutPnl(action, entry, risk, scaleOut!, close)
          : signedPnl(action, entry, close);
        return withScope({
          status: pnlR > 0.05 ? 'TAKE_PROFIT' : 'SESSION_END',
          pnl,
          pnlR,
          exitPrice: +close.toFixed(2),
          exitAt: tsMs,
          exitAtISO: toIso(tsMs),
          hitLevel: 'SIGNAL_FLIP',
          barsHeld: i + 1,
        });
      }
    }

    if (exitPolicy === 'momentum-decay-exit') {
      const decayExit = momentumDecayExit(
        action,
        setup,
        lockedPeakR,
        close,
        tsMs,
        i + 1,
        forwardCandles,
        i,
        scaleOut,
        withScope,
      );
      if (decayExit) return decayExit;
    }

    if (action === 'CE-BUY') {
      if (low <= stopLoss) {
        const pnlR = hasScaleOutActivity(scaleOut)
          ? blendedScaleOutPnlR(scaleOut!, -1)
          : -1;
        const pnl = hasScaleOutActivity(scaleOut)
          ? blendedScaleOutPnl(action, entry, risk, scaleOut!, stopLoss)
          : signedPnl(action, entry, stopLoss);
        return withScope({
          status: pnlR < -0.05 ? 'STOP_LOSS' : 'TAKE_PROFIT',
          pnl,
          pnlR,
          exitPrice: stopLoss,
          exitAt: tsMs,
          exitAtISO: toIso(tsMs),
          hitLevel: 'STOP_LOSS',
          barsHeld: i + 1,
        });
      }

      const floorExit = trailStopExit(
        action,
        setup,
        lockedPeakR,
        close,
        tsMs,
        i + 1,
        chandelier,
        structure,
        exitPolicy,
        hybridMinPeakR,
        scaleOut,
        withScope,
      );
      if (floorExit) return floorExit;

      if (
        sessionCloseSec != null &&
        isInSessionTightenWindow(tsSec, sessionCloseSec)
      ) {
        const tightenExit = sessionTightenExit(
          action,
          entry,
          risk,
          peakR,
          close,
          tsMs,
          i + 1,
          withScope,
        );
        if (tightenExit) return tightenExit;
      }
    } else {
      if (high >= stopLoss) {
        const pnlR = hasScaleOutActivity(scaleOut)
          ? blendedScaleOutPnlR(scaleOut!, -1)
          : -1;
        const pnl = hasScaleOutActivity(scaleOut)
          ? blendedScaleOutPnl(action, entry, risk, scaleOut!, stopLoss)
          : signedPnl(action, entry, stopLoss);
        return withScope({
          status: pnlR < -0.05 ? 'STOP_LOSS' : 'TAKE_PROFIT',
          pnl,
          pnlR,
          exitPrice: stopLoss,
          exitAt: tsMs,
          exitAtISO: toIso(tsMs),
          hitLevel: 'STOP_LOSS',
          barsHeld: i + 1,
        });
      }

      const floorExit = trailStopExit(
        action,
        setup,
        lockedPeakR,
        close,
        tsMs,
        i + 1,
        chandelier,
        structure,
        exitPolicy,
        hybridMinPeakR,
        scaleOut,
        withScope,
      );
      if (floorExit) return floorExit;

      if (
        sessionCloseSec != null &&
        isInSessionTightenWindow(tsSec, sessionCloseSec)
      ) {
        const tightenExit = sessionTightenExit(
          action,
          entry,
          risk,
          peakR,
          close,
          tsMs,
          i + 1,
          withScope,
        );
        if (tightenExit) return tightenExit;
      }
    }
  }

  const lastCandle = forwardCandles[forwardCandles.length - 1];
  const exitPrice = lastCandle[4];
  const exitAt = lastCandle[0] * 1000;
  const remainderR = exitRAtPrice(action, entry, risk, exitPrice);
  const pnlR = hasScaleOutActivity(scaleOut)
    ? blendedScaleOutPnlR(scaleOut!, remainderR)
    : remainderR;
  const pnl = hasScaleOutActivity(scaleOut)
    ? blendedScaleOutPnl(action, entry, risk, scaleOut!, exitPrice)
    : signedPnl(action, entry, exitPrice);
  const unresolvedStatus =
    simulationScope === 'session' ? 'SESSION_END' : 'OPEN';

  let hitLevel: TradeOutcome['hitLevel'] =
    simulationScope === 'session'
      ? highestTouchedLabel(tiers, peakTier) === 'OPEN'
        ? 'SESSION_END'
        : highestTouchedLabel(tiers, peakTier)
      : highestTouchedLabel(tiers, peakTier);
  if (hasScaleOutActivity(scaleOut)) {
    hitLevel = scaleOutHitLevel(scaleOut, hitLevel);
  }

  return withScope({
    status: unresolvedStatus,
    pnl,
    pnlR,
    exitPrice: +exitPrice.toFixed(2),
    exitAt,
    exitAtISO: toIso(exitAt),
    hitLevel,
    barsHeld: forwardCandles.length,
  });
}

export function isBenchmarkWin(
  status: TradeOutcome['status'],
  pnlR: number,
): boolean {
  return status === 'TAKE_PROFIT' || pnlR > 0.05;
}

export function isBenchmarkLoss(
  status: TradeOutcome['status'],
  pnlR: number,
): boolean {
  return status === 'STOP_LOSS' || pnlR < -0.05;
}