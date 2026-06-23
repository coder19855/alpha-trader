export type TradingStyle = 'INTRADAY' | 'SCALPER' | 'POSITIONAL';

export interface DeckGaugeReading {
  value: number;
  percent: number;
  ghost?: number | null;
  label: string;
}

export interface DeckGauges {
  option: DeckGaugeReading;
  priceAction: DeckGaugeReading;
  aligned?: boolean;
  conflict?: boolean;
}

export interface DeckComponentGauge {
  id: string;
  label: string;
  value: number;
  weight?: number;
  interpretation?: string;
  readout?: string;
  group: 'option' | 'priceAction';
}

export interface PaDrilldownRow {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'warn';
}

export interface PaDrilldownSection {
  id: string;
  title: string;
  rows: PaDrilldownRow[];
}

export interface PaDrilldown {
  primaryTimeframe?: string;
  sections: PaDrilldownSection[];
}

export interface VetoBreakupItem {
  id: string;
  label: string;
  state: 'block' | 'warn' | 'ok' | 'skipped';
  detail: string;
  meter?: number;
}

export interface DeckOpenPositionEntry {
  symbol: string;
  optionLabel?: string;
  indexLabel?: string;
  direction?: string;
  side?: string;
  netQty?: number;
  qty?: number;
  lots?: number;
  buyAvg?: number;
  avgPrice?: number;
  ltp?: number | null;
  unrealizedPnl?: number;
  pnlInr?: number | null;
  strike?: number | null;
  spot?: number | null;
  isWatchedIndex?: boolean;
  moneyness?: string;
  gammaLevel?: string;
}

export interface ConvictionBonus {
  label: string;
  points: number;
}

export interface DeckMarketRegime {
  kind: 'trending' | 'transitional' | 'sideways';
  direction: 'up' | 'down' | 'flat';
  arrow: '↑' | '↓' | '↔';
  label: string;
  hint: string;
  rawKind: 'trending' | 'transitional' | 'sideways';
  confirming: boolean;
  pollsInRegime?: number;
}

export interface VetoTimelinePoint {
  t: number;
  vetoed: boolean;
  action: string;
  vetoReason?: string;
}

export interface ChartOverlayLine {
  id: string;
  label: string;
  price: number;
  color: string;
  kind: 'hline' | 'line';
}

export interface DeckStrategyPayload {
  action: string;
  bias: string;
  conviction: number;
  recommendation: string;
  humanSummary: string;
  tradeGuidance: {
    shouldConsiderTrade: boolean;
    sizeRecommendation: string;
    notes: string;
    thresholds?: { enter: number; strong: number; cautionBelow: number };
    scoringWeights?: { priceAction: number; optionFlow: number };
  };
  riskNotes?: string[];
  suggestedRiskPercent?: number;
  strategies: Array<{
    strategy: string;
    risk?: string;
    confidenceScore: number;
    reason: string;
    executionHint?: string;
  }>;
  priceActionStrategies?: Array<{
    strategy: string;
    risk?: string;
    confidenceScore: number;
    reason: string;
    executionHint?: string;
  }>;
  optionStrategies?: Array<{
    strategy: string;
    risk?: string;
    confidenceScore: number;
    reason: string;
    executionHint?: string;
  }>;
  replayNote?: string;
}

export interface DeckLiveTick {
  type?: 'tick';
  mode?: 'live';
  asOf: string;
  /** ISO timestamp when price-action / conviction was last fully recomputed. */
  signalCalculatedAt?: string;
  symbol?: string;
  symbolLabel?: string;
  lotSize?: number | null;
  tradingStyle?: string;
  action: string;
  bias?: string;
  conviction: number;
  weightedBaseConviction?: number;
  convictionBonuses?: ConvictionBonus[];
  tfAligned?: number;
  tfAlignedTotal?: number;
  marketRegime?: DeckMarketRegime;
  entryThreshold: number;
  lastPrice: number;
  /** Session change vs previous close (Fyers ch / chp). */
  dayChange?: number;
  dayChangePct?: number;
  chartVetoed?: boolean;
  vetoReason?: string;
  gauges: DeckGauges;
  lanes: {
    optionPercent: number;
    priceActionPercent: number;
    combinedPercent: number;
  };
  spotSeries: Array<{ t: number; v: number }>;
  spotCandles?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  spotCandles5m?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  spotCandles15m?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  spotCandles1h?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  convictionSeries?: Array<{ t: number; option: number; priceAction: number; combined: number }>;
  markers?: Array<{ t: number; type: string; label: string; action?: string }>;
  events?: Array<{ t: number; type: string; label: string; detail?: string; action?: string }>;
  vetoTimeline?: VetoTimelinePoint[];
  paDrilldown?: PaDrilldown;
  vetoBreakup?: VetoBreakupItem[];
  optionComponents?: DeckComponentGauge[];
  priceActionComponents?: DeckComponentGauge[];
  flowMode?: string;
  vetoMode?: string;
  openPositions?: {
    asOf: string;
    entries: DeckOpenPositionEntry[];
    note?: string | null;
  };
  managementContext?: {
    hasOpenPosition: boolean;
    note?: string;
    advice?: {
      headline: string;
      overall?:
        | 'STRONG_HOLD'
        | 'HOLD'
        | 'PARTIAL_BOOK'
        | 'TRAIL'
        | 'EXIT_SOON'
        | 'HARD_EXIT'
        | 'CONFLICT'
        | 'WATCH';
    };
    autoExit?: {
      enabled: boolean;
      status: string;
      message: string;
      exitPolicy?: string;
      positionPolicy?: string;
    };
    autoEntry?: {
      enabled: boolean;
      dryRun?: boolean;
      armedLive?: boolean;
      status: string;
      message: string;
      dryRunsToday?: number;
      signalMode?: string;
      signalProfile?: string;
      entryThreshold?: number;
      lots?: number;
      entriesToday?: number;
      maxEntriesPerDay?: number;
      greenDayLocked?: boolean;
      confirmationCount?: number;
      confirmationsRequired?: number;
      pendingAction?: string | null;
      pendingReason?: string | null;
      lastExecutedAt?: string | null;
      lastEvaluatedAt?: string | null;
      recentEvents?: AutoEntryTraceEvent[];
    };
  };
  patternInsights?: Array<{
    timeframe: string;
    pattern: string;
    tone: string;
    label: string;
    status?: string;
    biasLabel?: string;
    type?: 'chart' | 'candlestick';
    neckline?: number;
    points?: Array<{
      index: number;
      price: number;
      kind: 'high' | 'low';
      t?: number;
    }>;
  }>;
  chartPatternNeckline?: number;
  strategyRecommendation?: DeckStrategyPayload;
}

export interface DeckReplayPoint {
  t: number;
  spot: number;
  action: string;
  conviction: number;
  paPercent: number;
  optionPercent: number;
  paNeedle: number;
  optionNeedle: number;
  vetoed: boolean;
  vetoReason?: string;
  whatIfAction: string;
  whatIfConviction: number;
  patternInsights?: DeckLiveTick['patternInsights'];
  paDrilldown?: PaDrilldown;
  chartPatternNeckline?: number;
}

export interface DeckReplayPayload {
  mode: 'replay';
  symbol: string;
  symbolLabel: string;
  lotSize?: number | null;
  tradingStyle: string;
  sessionDate: string;
  entryThreshold: number;
  gauges: DeckGauges;
  replayPoints: DeckReplayPoint[];
  spotSeries: Array<{ t: number; v: number }>;
  spotCandles: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  spotCandles5m?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  spotCandles15m?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  spotCandles1h?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  events: Array<{ t: number; type: string; label: string; detail?: string }>;
  patternInsights?: DeckLiveTick['patternInsights'];
  paDrilldown?: PaDrilldown;
  vetoBreakup?: VetoBreakupItem[];
  priceActionComponents?: DeckComponentGauge[];
  pnlSeries: Array<{ t: number; v: number }>;
  pnlNote?: string;
  vetoTimeline?: VetoTimelinePoint[];
  marketRegime?: DeckMarketRegime;
  lanes?: DeckLiveTick['lanes'];
  strategyRecommendation?: DeckStrategyPayload;
}

export interface WebSession {
  page: string;
  mode: string;
  symbol: string;
  style: string;
  sessionDate: string;
  auth: { fyersValid: boolean; canUseApis: boolean };
}

export interface SettingsSnapshot {
  vetoMode: string;
  tradingStyle: string;
  optionChainPollMs?: number;
  flowMode: string;
  canPersist: boolean;
  groups: Array<{
    id: string;
    title: string;
    field: string;
    control: string;
    options?: Array<{ value: string; label: string; hint?: string }>;
  }>;
}

export interface AutoExitSnapshot {
  enabled: boolean;
  retestCount: number;
  signalFlipExit: boolean;
  exitPolicy: string;
  positionPolicy: string;
  exitPolicies: Array<{ id: string; label: string; hint: string }>;
  positionPolicies: Array<{ id: string; label: string; hint: string }>;
}

export type AutoEntrySignalMode = 'engine' | 'single';

export interface AutoEntrySnapshot {
  enabled: boolean;
  dryRun: boolean;
  armedLive: boolean;
  armedLiveSessionDate?: string | null;
  signalMode: AutoEntrySignalMode;
  signalProfile: string;
  entryThreshold: number;
  ignoreChartVeto: boolean;
  lots: number;
  maxEntriesPerDay: number;
  greenDayStop: boolean;
  signalPresetGroups: Array<{
    id: string;
    label: string;
    presets: Array<{ id: string; label: string; gates: string[] }>;
  }>;
  session?: {
    entriesToday: number;
    dryRunsToday?: number;
    maxEntriesPerDay: number;
    greenDayLocked: boolean;
    canEnter: boolean;
    blockReason: string | null;
  };
  hints?: string[];
  limits?: {
    minLots: number;
    maxLots: number;
    minEntriesPerDay: number;
    maxEntriesPerDay: number;
    minEntryThreshold: number;
    maxEntryThreshold: number;
    greenDayMinR: number;
  };
  warning?: string;
}

export interface AutoEntryTraceEvent {
  at: string;
  stage:
    | 'off'
    | 'watching'
    | 'signal'
    | 'blocked'
    | 'pending'
    | 'executed'
    | 'simulated'
    | 'cooldown';
  tone: 'neutral' | 'success' | 'warn' | 'error';
  title: string;
  detail?: string;
}

export interface MarketNewsItem {
  id: string;
  title: string;
  link: string;
  source?: string;
  publishedAt?: string;
}

export interface MarketNewsPayload {
  items: MarketNewsItem[];
  fetchedAt: string;
  query: string;
}

export interface TradeJournalEntry {
  id: string;
  symbol: string;
  tradingStyle: string;
  side: 'CE' | 'PE' | 'UNKNOWN';
  symbolLabel?: string;
  entryAt: string;
  exitAt?: string | null;
  status: 'open' | 'closed';
  paTrigger?: string | null;
  optionTrigger?: string | null;
  optionTriggerPending?: boolean;
  entryNote?: string | null;
  exitNote?: string | null;
  positionId?: string | null;
}