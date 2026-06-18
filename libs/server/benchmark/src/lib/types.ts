import { AIAnalysisResponse } from './benchmark-stubs.js';
import { RrLabel, TradeSetup } from '@alpha-trader/server-shared';
import { TradingStyle } from '@alpha-trader/server-shared';
import { FlowMode } from '@alpha-trader/server-shared';
import { VetoMode } from '@alpha-trader/server-shared';

import { BenchmarkSignalProfile } from './signal-profile.js';
import { BenchmarkExitPolicy } from '@alpha-trader/server-analysis';
import { NoTradeWindow } from '@alpha-trader/server-analysis';
import { BenchmarkPositionPolicy } from '@alpha-trader/server-position';

export type BenchmarkJobPhase =
  | 'queued'
  | 'fetching'
  | 'replaying'
  | 'simulating'
  | 'ai'
  | 'finalizing'
  | 'complete'
  | 'failed';

export type BenchmarkJobStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface BenchmarkJobProgress {
  phase: BenchmarkJobPhase;
  percent: number;
  message: string;
  currentDay?: number;
  totalDays?: number;
  anchorsDone?: number;
  anchorsTotal?: number;
  elapsedMs?: number;
}

export interface BenchmarkJobRecord {
  jobId: string;
  status: BenchmarkJobStatus;
  progress: BenchmarkJobProgress;
  params: BenchmarkParams & { days: number };
  reportId?: string;
  error?: string;
  runStartedAtMs?: number;
  jobMaxMs?: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
}

export type BenchmarkAiMode = 'off' | 'shadow' | 'active';
export type BenchmarkOptionSource = 'snapshot' | 'neutral_fallback';
/** `index` = spot R-multiples; `synthetic_weekly_option` = 1-lot weekly premium P&L. */
export type BenchmarkPnlModel = 'index' | 'synthetic_weekly_option';

export type BenchmarkProgressCallback = (
  progress: BenchmarkJobProgress,
) => void | Promise<void>;

export interface BenchmarkParams {
  symbol: string;
  tradingStyle: TradingStyle;
  days?: number;
  vetoMode?: VetoMode;
  flowMode?: FlowMode;
  aiMode?: BenchmarkAiMode;
  /** Cap live AI API calls per run (cost control). */
  maxAiCalls?: number;
  sessionOnly?: boolean;
  intervalMinutes?: number;
  toMs?: number;
  /** Explicit window start (IST session open). Overrides days-based fromMs when set with toMs. */
  fromMs?: number;
  /** IST calendar labels for reports and exports. */
  windowStartDate?: string;
  windowEndDate?: string;
  /** Cap entries per session day; omit for unlimited. */
  maxTradesPerDay?: number;
  /** Exit at market when peak ≥1R and opposite engine confirms (2 polls). */
  signalFlipExit?: boolean;
  /** Paper starting capital in INR (default ₹5L). */
  startingCapitalInr?: number;
  /** Override risk % per trade for capital projection. */
  riskPercentPerTrade?: number;
  /** Async job progress hook (benchmark jobs + mini app polling). */
  onProgress?: BenchmarkProgressCallback;
  /** Capital projection model (default: index spot R × risk budget). */
  pnlModel?: BenchmarkPnlModel;
  /** Stop session after any trade closes ≥1R. */
  greenDayStop?: boolean;
  /** Stop session when day net R falls to this level (e.g. −2). */
  dailyLossCapR?: number;
  /** Penalize or block entries when the move has already extended. */
  chaseDecay?: boolean;
  /** Epoch ms when the benchmark job entered the running phase. */
  runStartedAtMs?: number;
  /**
   * Fast entry profile — bypasses slow PA/option conviction when set.
   * Uses same tradeSetup + trailing R:R exits as the default engine.
   */
  signalProfile?: BenchmarkSignalProfile | string;
  /** Run multiple signal presets and compare total R (slower — one replay per variant). */
  signalMatrix?: string[];
  /** Trailing exit model for simulation (default: R:R ladder). */
  exitPolicy?: BenchmarkExitPolicy;
  /** Compare multiple exit policies (one replay per variant). */
  exitMatrix?: BenchmarkExitPolicy[];
  /** Scale-out at TP tiers; remainder uses exitPolicy trail (default flat). */
  positionPolicy?: BenchmarkPositionPolicy;
  /** Compare flat vs scale-ladder on identical entries. */
  positionMatrix?: BenchmarkPositionPolicy[];
  /** IST clock ranges when new entries are blocked (e.g. 09:15–09:30 open chop). */
  noTradeWindows?: NoTradeWindow[];
}

export interface BenchmarkCapitalSummary {
  startingCapitalInr: number;
  endingCapitalInr: number;
  netPnlInr: number;
  netPnlPercent: number;
  riskPercentPerTrade: number;
  compounding: boolean;
  maxDrawdownInr: number;
  maxDrawdownPercent: number;
  maxDrawdownR: number;
  note: string;
}

export interface BenchmarkTradeRow {
  signalAtMs: number;
  signalAtISO: string;
  sessionDate: string;
  action: 'CE-BUY' | 'PE-BUY';
  indexEntry: number;
  indexExit: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  setup: TradeSetup;
  exitStatus: 'STOP_LOSS' | 'TAKE_PROFIT' | 'SESSION_END' | 'OPEN';
  hitLevel:
    | RrLabel
    | 'STOP_LOSS'
    | 'SESSION_END'
    | 'SESSION_TIGHTEN'
    | 'OPEN'
    | 'SIGNAL_FLIP'
    | 'TRAIL_FLOOR'
    | 'CHANDELIER'
    | 'ATR_TIGHTEN'
    | 'PARTIAL_SCALE'
    | 'SCALE_LADDER'
    | 'STRUCTURE_TRAIL'
    | 'MOMENTUM_DECAY'
    | 'BE';
  pnlPoints: number;
  pnlR: number;
  pnlPercent: number;
  /** Max favorable R reached during the trade. */
  peakR: number;
  /** Worst signed R during the trade (max adverse excursion). */
  maxAdverseR: number;
  /** R given back from peak to exit. */
  givebackR: number;
  /** INR P&L using compounding risk budget × R, or option premium delta × lot. */
  pnlInr?: number;
  riskBudgetInr?: number;
  /** Synthetic weekly option fields (when pnlModel = synthetic_weekly_option). */
  optionEntryPremium?: number;
  optionExitPremium?: number;
  optionDelta?: number;
  optionDteDays?: number;
  optionLots?: number;
  optionLotSize?: number;
  barsHeld: number;
  conviction: number;
  convictionWithAi?: number;
  optionSource: BenchmarkOptionSource;
  engineVerdict: string;
  aiAnalysis?: AIAnalysisResponse;
  aiVerdictSummary?: string;
}

export interface BenchmarkVariantSummary {
  label: string;
  totalSignals: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number;
  avgPnlR: number;
  totalPnlR: number;
  avgPnlPercent: number;
  stopLossCount: number;
  takeProfitCounts: Record<'1:1' | '1:1.5' | '1:2.5' | '1:4', number>;
  sessionEndCount: number;
  sessionTightenCount: number;
  signalFlipCount: number;
  trailFloorCount: number;
  beCount: number;
}

export interface BenchmarkAiOpinionStats {
  provider: string;
  analyzed: number;
  unavailable: number;
  agree: number;
  disagree: number;
  caution: number;
  missingKey: number;
  invalidKey: number;
  quotaExhausted: number;
  rateLimited: number;
  skipped: number;
  dominantIssue?: string;
}

export interface BenchmarkFilterStats {
  anchorsScanned: number;
  /** CE/PE signals before conviction threshold. */
  rawDirectional: number;
  /** Passed conviction + had trade setup. */
  tradeCandidates: number;
  chaseBlocked: number;
  /** Chase decay pulled conviction below enter threshold. */
  chaseDecayFiltered: number;
  convictionFiltered: number;
  /** Signal profile gate rejected (breakout/volume/pattern). */
  signalProfileFiltered?: number;
  noSetup: number;
  sessionDayBlocked: number;
  maxTradesBlocked: number;
  cooldownBlocked: number;
  noTradeWindowBlocked?: number;
  tradesTaken: number;
}

export interface BenchmarkMatrixVariantResult {
  profileId: string;
  label: string;
  summary: BenchmarkVariantSummary;
  filterStats: BenchmarkFilterStats;
  totalPnlR: number;
  /** Entry gates for this preset (breakout, volume, RSI, …). */
  gates?: string[];
  /** Total R minus baseline variant (usually sparsest combo in the matrix). */
  deltaVsBaselineR?: number;
  rank?: number;
}

export interface BenchmarkMatrixComparison {
  variants: BenchmarkMatrixVariantResult[];
  winnerId: string;
  winnerLabel: string;
  notes: string[];
  /** Baseline preset id used for delta column (lowest gate count / breakout-vol). */
  baselineId?: string;
  baselineLabel?: string;
  /** Short interpretation: winner margin, vs base, combo effect. */
  insights?: string[];
}

export interface BenchmarkAiComparison {
  baseline: BenchmarkVariantSummary;
  withAi: BenchmarkVariantSummary | null;
  aiAgreeOnWins: number;
  aiAgreeOnLosses: number;
  aiDisagreeOnWins: number;
  aiDisagreeOnLosses: number;
  aiOpinionStats?: BenchmarkAiOpinionStats;
  notes: string[];
}

export interface BenchmarkReport {
  reportId?: string;
  params: BenchmarkParams & {
    days: number;
    intervalMinutes: number;
    enterThreshold: number;
  };
  filterStats?: BenchmarkFilterStats;
  simulationNote: string;
  optionFlowNote: string;
  aiComparison: BenchmarkAiComparison;
  trades: BenchmarkTradeRow[];
  equityCurve: Array<{ t: number; cumulativeR: number; label: string }>;
  capitalSummary: BenchmarkCapitalSummary;
  capitalCurve: Array<{
    t: number;
    capitalInr: number;
    pnlInr: number;
    label: string;
  }>;
  stopLossNote: string;
  generatedAt: string;
  /** Total wall-clock ms for the benchmark run. */
  durationMs?: number;
  /** Populated when signalMatrix runs multiple entry combos. */
  matrixComparison?: BenchmarkMatrixComparison;
  signalProfileLabel?: string;
}