import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface BenchmarkOptions {
  symbols: Array<{ symbol: string; label: string; shortName: string }>;
  tradingStyles: Array<{ id: string; label: string }>;
  aiModes: Array<{ id: string; label: string }>;
  pnlModels: Array<{ id: string; label: string }>;
  flowModes: Array<{ id: string; label: string }>;
  exitPolicies: Array<{ id: string; label: string; hint: string }>;
  positionPolicies: Array<{ id: string; label: string; hint: string }>;
  exitModeHints?: Array<{ id: string; label: string; detail: string }>;
  positionModeHints?: Array<{ id: string; label: string; detail: string }>;
  signalPresets: Array<{ id: string; label: string; gates: string[] }>;
  signalPresetGroups: Array<{
    id: string;
    label: string;
    presets: Array<{ id: string; label: string; gates: string[] }>;
  }>;
  defaults: Record<string, unknown>;
  limits: {
    minDays: number;
    maxDays: number;
    maxTradesPerDay: number;
    maxReplaysWithoutConfirm: number;
  };
  notes: { simulation: string; optionFlow: string };
}

export interface BenchmarkJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  progress: {
    phase: string;
    percent: number;
    message: string;
    elapsedMs?: number;
  };
  reportId: string | null;
  error: string | null;
  jobMaxMs: number | null;
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

export interface BenchmarkFilterStats {
  anchorsScanned: number;
  rawDirectional: number;
  tradeCandidates: number;
  chaseBlocked: number;
  chaseDecayFiltered: number;
  convictionFiltered: number;
  signalProfileFiltered?: number;
  noSetup: number;
  sessionDayBlocked: number;
  maxTradesBlocked: number;
  cooldownBlocked: number;
  noTradeWindowBlocked?: number;
  avoidFirst5MinBlocked?: number;
  avoidTightRangeBlocked?: number;
  requireRetestBlocked?: number;
  tradesTaken: number;
}

export interface BenchmarkMatrixVariantResult {
  profileId: string;
  label: string;
  summary: BenchmarkVariantSummary;
  filterStats: BenchmarkFilterStats;
  totalPnlR: number;
  gates?: string[];
  deltaVsBaselineR?: number;
  rank?: number;
}

export interface BenchmarkMatrixComparison {
  variants: BenchmarkMatrixVariantResult[];
  winnerId: string;
  winnerLabel: string;
  notes: string[];
  baselineId?: string;
  baselineLabel?: string;
  insights?: string[];
}

export interface BenchmarkReport {
  reportId: string;
  params?: {
    symbol: string;
    tradingStyle: string;
    days: number;
    exitPolicy?: string;
    positionPolicy?: string;
    aiMode?: string;
    pnlModel?: string;
    chaseDecay?: boolean;
    greenDayStop?: boolean;
    dailyLossCapR?: number;
    maxTradesPerDay?: number;
    requireRetest?: boolean;
    windowStartDate?: string;
    windowEndDate?: string;
  };
  filterStats?: BenchmarkFilterStats;
  aiComparison?: {
    baseline: BenchmarkVariantSummary | null;
    withAi: BenchmarkVariantSummary | null;
    aiAgreeOnWins: number;
    aiAgreeOnLosses: number;
    aiDisagreeOnWins: number;
    aiDisagreeOnLosses: number;
    notes: string[];
  };
  matrixComparison?: BenchmarkMatrixComparison;
  /** Populated by UI normalizer from aiComparison.baseline */
  summary?: {
    totalTrades: number;
    winRate: number;
    totalR: number;
    avgR: number;
    bestR: number;
    worstR: number;
  };
  capitalSummary: {
    startingCapitalInr: number;
    endingCapitalInr: number;
    netPnlInr: number;
    netPnlPercent: number;
    riskPercentPerTrade?: number;
    maxDrawdownInr?: number;
    maxDrawdownPercent?: number;
    maxDrawdownR?: number;
    note?: string;
  };
  equityCurve: Array<{ t: number; cumulativeR: number; label: string }>;
  capitalCurve?: Array<{ t: number; capitalInr: number; pnlInr: number; label: string }>;
  trades: Array<{
    signalAtISO: string;
    sessionDate: string;
    action: string;
    indexEntry?: number;
    indexExit?: number;
    stopLoss?: number;
    takeProfit1?: number;
    takeProfit2?: number;
    takeProfit3?: number;
    pnlR: number;
    pnlInr?: number;
    pnlPercent?: number;
    peakR?: number;
    maxAdverseR?: number;
    givebackR?: number;
    conviction?: number;
    hitLevel: string;
    exitStatus?: string;
    pnlPoints?: number;
    optionEntryPremium?: number;
    optionExitPremium?: number;
    optionDelta?: number;
    optionDteDays?: number;
    optionLots?: number;
    optionLotSize?: number;
    engineVerdict?: string;
    aiVerdictSummary?: string;
    isWin?: boolean;
  }>;
  simulationNote: string;
  optionFlowNote?: string;
  stopLossNote?: string;
  generatedAt: string;
  durationMs?: number;
}

@Injectable({ providedIn: 'root' })
export class BenchmarkApiService {
  private readonly http = inject(HttpClient);

  getOptions(symbol: string, style: string) {
    const params = new URLSearchParams({ symbol, style });
    return this.http.get<BenchmarkOptions>(`/api/benchmark/options?${params}`);
  }

  start(config: Record<string, unknown>) {
    return this.http.post<{ jobId: string; replays: number; jobMaxMs: number }>(
      '/api/benchmark/start',
      config,
    );
  }

  status(jobId: string) {
    return this.http.get<BenchmarkJobStatus>(`/api/benchmark/status?jobId=${jobId}`);
  }

  report(reportId: string) {
    return this.http.get<BenchmarkReport>(`/api/benchmark/report?reportId=${reportId}`);
  }

  exportUrl(reportId: string): string {
    return `/api/benchmark/export?reportId=${encodeURIComponent(reportId)}`;
  }
}