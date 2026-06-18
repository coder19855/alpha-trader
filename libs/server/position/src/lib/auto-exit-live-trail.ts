import {
  CHANDELIER_DEFAULT_ATR_MULT,
  CHANDELIER_DEFAULT_PERIOD,
  CHANDELIER_HYBRID_MIN_PEAK_R,
  BenchmarkExitPolicy,
  initChandelierState,
  resolveChandelierMultiplier,
  trueRange,
  updateChandelierState,
  updateWilderAtr,
  usesChandelierTrail,
} from '@alpha-trader/server-analysis';
import {
  initStructureTrailState,
  updateStructureTrailState,
} from '@alpha-trader/server-analysis';
import { TradeSetup } from '@alpha-trader/server-shared';
import { HeldDirection } from './position-monitor.js';
import { AutoExitRuntimeState } from './auto-exit-state.js';
import {
  BenchmarkPositionPolicy,
  ScaleOutState,
  ScaleOutTier,
  initScaleOutState,
  tierRMultiplier,
  updateScaleOutOnTierTouch,
} from './position-policy.js';

export interface LiveTrailTickInput {
  heldDirection: HeldDirection;
  spot: number;
  tradeSetup: TradeSetup;
  peakR: number;
  exitPolicy: BenchmarkExitPolicy;
  positionPolicy: BenchmarkPositionPolicy;
  runtime: AutoExitRuntimeState;
}

function seedAtr(tradeSetup: TradeSetup): number {
  return tradeSetup.atrUsed > 0 ? tradeSetup.atrUsed : tradeSetup.risk;
}

export function ensureLiveTrailRuntime(
  input: Omit<LiveTrailTickInput, 'spot' | 'peakR'>,
): void {
  const { heldDirection, tradeSetup, exitPolicy, positionPolicy, runtime } =
    input;
  const atr = seedAtr(tradeSetup);

  if (usesChandelierTrail(exitPolicy) && !runtime.chandelier) {
    runtime.chandelier = initChandelierState(
      heldDirection,
      tradeSetup.entry,
      atr,
      CHANDELIER_DEFAULT_ATR_MULT,
    );
    runtime.runningAtr = runtime.chandelier!.atr;
  }
  if (exitPolicy === 'structure-trail' && !runtime.structure) {
    runtime.structure = initStructureTrailState(
      heldDirection,
      tradeSetup.entry,
      atr,
    );
    runtime.runningAtr = atr;
  }
  if (!runtime.scaleOut) {
    runtime.scaleOut = initScaleOutState(positionPolicy, exitPolicy);
  }
  if (runtime.runningAtr <= 0) {
    runtime.runningAtr = atr;
  }
  if (runtime.lastSpot == null) {
    runtime.lastSpot = tradeSetup.entry;
  }
}

export function tickLiveTrailRuntime(input: LiveTrailTickInput): void {
  const {
    heldDirection,
    spot,
    tradeSetup,
    peakR,
    exitPolicy,
    positionPolicy,
    runtime,
  } = input;

  ensureLiveTrailRuntime({
    heldDirection,
    tradeSetup,
    exitPolicy,
    positionPolicy,
    runtime,
  });

  const prevClose = runtime.lastSpot ?? tradeSetup.entry;
  const high = Math.max(spot, prevClose);
  const low = Math.min(spot, prevClose);

  if (runtime.chandelier) {
    const mult = resolveChandelierMultiplier(
      exitPolicy,
      peakR,
      CHANDELIER_DEFAULT_ATR_MULT,
    );
    runtime.chandelier = updateChandelierState(
      heldDirection,
      runtime.chandelier,
      high,
      low,
      prevClose,
      CHANDELIER_DEFAULT_PERIOD,
      mult,
    );
    runtime.runningAtr = runtime.chandelier!.atr;
  } else {
    runtime.runningAtr = updateWilderAtr(
      runtime.runningAtr,
      trueRange(high, low, prevClose),
      CHANDELIER_DEFAULT_PERIOD,
    );
  }

  if (runtime.structure) {
    runtime.structure = updateStructureTrailState(
      heldDirection,
      runtime.structure,
      high,
      low,
      runtime.runningAtr,
      peakR,
    );
  }

  runtime.lastSpot = spot;
}

export function peakTierFromR(
  peakR: number,
  tiers: TradeSetup['takeProfits'],
): ScaleOutTier {
  const sorted = [...tiers].sort((a, b) => a.multiplier - b.multiplier);
  let touched: ScaleOutTier = 0;
  for (let i = 0; i < sorted.length && i < 3; i += 1) {
    const tier = (i + 1) as 1 | 2 | 3;
    const threshold = tierRMultiplier(sorted, tier);
    if (peakR >= threshold) touched = tier;
  }
  if (touched === 0 && peakR >= 1.5) touched = 1;
  if (touched === 1 && peakR >= 2.5) touched = 2;
  if (touched === 2 && peakR >= 4) touched = 3;
  return touched;
}

export function syncScaleOutFromPeak(
  peakR: number,
  tradeSetup: TradeSetup,
  scaleOut: ScaleOutState | null,
): ScaleOutTier {
  if (!scaleOut) return 0;
  const touched = peakTierFromR(peakR, tradeSetup.takeProfits);
  updateScaleOutOnTierTouch(scaleOut, touched, tradeSetup.takeProfits);
  return touched;
}

export { CHANDELIER_HYBRID_MIN_PEAK_R };