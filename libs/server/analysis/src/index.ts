export { registerAnalysisPlugins } from './lib/register-analysis-plugins.js';
export { computePriceAction, parseVetoModeQuery } from './lib/compute-price-action.js';
export { computePaDecision } from './lib/compute-pa-decision.js';

export {
  computeOppositeExitStreak,
  buildFlipExitSignals,
  findFirstConfirmedFlipExit,
} from './lib/technical-analysis/flip-exit-policy.js';
export type { EnginePollRead } from './lib/technical-analysis/flip-exit-policy.js';
export {
  buildTrailingTpHoldGuidance,
  evaluateTrailingTpState,
  highestTpHit,
  nextTpLevel,
  favorableR,
  floorPriceFromR,
  resolveTrailFloorR,
  signedR,
  computeDrawdownFromSeries,
} from './lib/technical-analysis/trailing-tp-policy.js';

export {
  PARTIAL_SCALE_FRACTION,
  PARTIAL_SCALE_TP_R,
  isCloseThroughStop,
  CHANDELIER_HYBRID_MIN_PEAK_R,
  CHANDELIER_DEFAULT_PERIOD,
  CHANDELIER_DEFAULT_ATR_MULT,
  BENCHMARK_EXIT_MATRIX_PRESETS,
  usesChandelierTrail,
  resolveChandelierMultiplier,
  trueRange,
  updateWilderAtr,
  initChandelierState,
  updateChandelierState,
  describeExitPolicy,
} from './lib/technical-analysis/chandelier-exit.js';
export type {
  BenchmarkExitPolicy,
  ChandelierState,
} from './lib/technical-analysis/chandelier-exit.js';

export {
  isStrongOppositeSignal,
} from './lib/technical-analysis/flip-exit-policy.js';

export {
  resolveTrailStop,
  exitRAtPrice,
} from './lib/technical-analysis/live-trail-stop.js';
export type { ResolvedTrailStop } from './lib/technical-analysis/live-trail-stop.js';

export {
  MOMENTUM_EXIT_DECAY_THRESHOLD,
  MOMENTUM_EXIT_MIN_PEAK_R,
} from './lib/technical-analysis/sim-momentum-decay.js';

export {
  initStructureTrailState,
  updateStructureTrailState,
} from './lib/technical-analysis/structure-trail-exit.js';
export type { StructureTrailState } from './lib/technical-analysis/structure-trail-exit.js';

export { normalizeStopLoss } from './lib/technical-analysis/stop-utils.js';

export {
  alignmentToGaugeValue,
  higherTfToGaugeValue,
  isHigherTfSupportive,
  countAlignedTimeframes,
  type TimeframeScores,
} from './lib/technical-analysis/timeframe-alignment.js';

export { computeTechnicalAnalysisTimeline } from './lib/services/technical-analysis-timeline.js';

export { buildPriceActionSnapshot } from './lib/technical-analysis/snapshot.js';
export type { SnapshotDeps } from './lib/technical-analysis/snapshot.js';

export {
  advanceCandleEndIndex,
  buildTimelineAnchors,
  buildTradeSetup,
  getIstSessionKey,
  getNseSessionCloseSec,
  getNseSessionOpenSec,
  parseEpochMs,
  resolveSimulationUntilSec,
  sliceCandlesAfter,
  sliceCandlesUpTo,
  toIso,
} from './lib/technical-analysis/timeline-utils.js';

export {
  CHASE_DECAY_BENCHMARK_NOTE,
  evaluateChaseDecay,
} from './lib/technical-analysis/chase-decay.js';
export type { ChaseDecayResult } from './lib/technical-analysis/chase-decay.js';

export {
  formatNoTradeWindows,
  isWithinNoTradeWindow,
  parseNoTradeWindows,
} from './lib/technical-analysis/no-trade-window.js';
export type { NoTradeWindow } from './lib/technical-analysis/no-trade-window.js';

export { computeSimMomentumDecayPercent } from './lib/technical-analysis/sim-momentum-decay.js';

export type { FlipExitSignal } from './lib/technical-analysis/flip-exit-policy.js';