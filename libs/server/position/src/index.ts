export {
  computeManagementAdvice,
  computePositionHealthScore,
  fetchOpenIndexOptionPositions,
  getOpenPositionContext,
  hasLiveOpenPosition,
  buildOpenPositionContextFromPositions,
  clearOpenPositionsCache,
  evaluateOpenPositionTpAlerts,
  mapFyersPositionRowToMonitorContext,
} from './lib/position-monitor.js';

export type {
  ManagementAdvice,
  OpenPositionContext,
  PositionManagementContext,
  PositionHealth,
  HeldDirection,
} from './lib/position-monitor.js';

export {
  normalizePriceActionSignal,
  toManagementDecisionPayload,
  toManagementPriceData,
  alertPayloadToManagementPriceData,
  priceActionToManagementPriceData,
  formatTradeDecisionError,
} from './lib/management-decision-mapper.js';

export {
  BENCHMARK_POSITION_MATRIX_PRESETS,
  blendedScaleOutPnl,
  blendedScaleOutPnlR,
  describePositionPolicy,
  hasScaleOutActivity,
  initScaleOutState,
  parsePositionMatrixToken,
  scaleOutHitLevel,
  updateScaleOutOnTierTouch,
  type BenchmarkPositionPolicy,
  type ScaleOutState,
} from './lib/position-policy.js';

export {
  evaluateScaleOutSignal,
  evaluateBenchmarkAutoExitSignal,
  updatePeakR,
  resolveTrailFloorForDisplay,
  resolveActiveTrailStopForDisplay,
} from './lib/auto-exit-evaluator.js';

export {
  attachAutoExitGuard,
  refreshAutoExitGuardDisplay,
  type AutoExitGuardPreference,
  type AutoExitDecisionSlice,
} from './lib/auto-exit-runner.js';

export {
  placeAutoEntryBuy,
  simulateAutoEntryBuy,
  resolveAtmOptionLeg,
  type AutoEntryOrderResult,
} from './lib/auto-entry-executor.js';

export {
  autoEntryStateKey,
  getAutoEntryRuntimeState,
  setAutoEntryRuntimeState,
  resetAutoEntryRuntimeState,
  type AutoEntryRuntimeState,
} from './lib/auto-entry-state.js';

export type { AutoEntryGuardStatus } from './lib/position-monitor.js';

export {
  autoExitStateKey,
  getAutoExitRuntimeState,
  setAutoExitRuntimeState,
  resetAutoExitRuntimeState,
} from './lib/auto-exit-state.js';

export { resolveHeldEntrySpot } from './lib/held-position-trade-setup.js';

export {
  evaluateEngagedExitDecision,
  resolveExitConvictionFloor,
  buildEngagementContext,
  isIndexStopBreached,
  buildExitTelemetry,
  resolveEngagedHeldDirection,
  resolveHeldDirectionFromOpenPositions,
} from './lib/signal-exit-policy.js';