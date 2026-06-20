import {
  ChartPatternId,
  ChartPatternResult,
  PriceActionResponse,
  TfComponentSignals,
  Timeframe,
  TradeAction,
} from '@alpha-trader/server-shared';

/** Raw detector outputs exposed per timeframe for benchmark A/B. */
export type PaComponentId = keyof TfComponentSignals;
export type PaComponentSignals = TfComponentSignals;

export type BenchmarkEntryMode = 'engine' | 'signal';

/**
 * Fast entry profile — bypasses slow PA/option blend when entryMode is `signal`.
 * Uses the same tradeSetup + trailing R:R simulation as the default engine path.
 */
export interface BenchmarkSignalProfile {
  id: string;
  label: string;
  entryMode?: BenchmarkEntryMode;
  /** TFs to scan; any matching TF can trigger (OR). Default: primary style TF only. */
  timeframes?: Timeframe[];
  /** S/R breakout: +1 bull / −1 bear on the TF. */
  requireBreakout?: boolean;
  /** Last bar volume > 1.5× 20-bar avg on the TF. */
  requireHighVolume?: boolean;
  /** Require a retest after breakout on the TF (componentSignals.retest === 1). */
  requireRetest?: boolean;
  /** Confirmed chart pattern breakout (or range/trendline break) on the TF. */
  requireChartPatternBreakout?: boolean;
  /** BOS (+1/−1) must agree with breakout direction on the TF. */
  requireBos?: boolean;
  /** Minimum ADX on triggering TF (e.g. 20). */
  minAdx?: number;
  /** Bull: RSI ≥ minRsi; bear: RSI ≤ (100 − minRsi) when maxRsi omitted. */
  minRsi?: number;
  /** Bull: RSI ≤ maxRsi (avoid overbought); bear: RSI ≥ maxRsi when minRsi omitted. */
  maxRsi?: number;
  /** MACD histogram must agree with breakout direction. */
  requireMacd?: boolean;
  /** Close must be above (bull) / below (bear) EMA20 on the TF. */
  requireEmaTrend?: boolean;
  /** Price outside Bollinger band in breakout direction. */
  requireBollingerBreakout?: boolean;
  /** Per-component hard gates on the triggering TF. */
  componentGates?: Partial<
    Record<
      PaComponentId,
      { min?: number; max?: number; sign?: 'bull' | 'bear' }
    >
  >;
  /** Enable chart pattern detection during benchmark replay (slower). */
  enableChartPatterns?: boolean;
  /** Skip conviction threshold when entryMode is signal (default true). */
  skipConvictionGate?: boolean;
}

export interface SignalProfileMatch {
  action: 'CE-BUY' | 'PE-BUY';
  timeframe: Timeframe;
  reason: string;
}

const BREAKOUT_PATTERN_IDS = new Set<ChartPatternId>([
  'range_breakout_bull',
  'range_breakout_bear',
  'trendline_break_bull',
  'trendline_break_bear',
  'bull_flag',
  'bear_flag',
]);

export const BENCHMARK_SIGNAL_PRESETS: Record<string, BenchmarkSignalProfile> = {
  engine: {
    id: 'engine',
    label: 'Default engine (PA-only conviction gates)',
    entryMode: 'engine',
  },
  'breakout-vol': {
    id: 'breakout-vol',
    label: 'S/R breakout + high volume',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBreakout: true,
    requireHighVolume: true,
  },
  'pattern-breakout-vol': {
    id: 'pattern-breakout-vol',
    label: 'Chart pattern breakout + high volume',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireChartPatternBreakout: true,
    requireHighVolume: true,
    enableChartPatterns: true,
  },
  'breakout-bos': {
    id: 'breakout-bos',
    label: 'Breakout + BOS alignment',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBreakout: true,
    requireBos: true,
  },
  'breakout-adx': {
    id: 'breakout-adx',
    label: 'Breakout + ADX ≥ 20',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBreakout: true,
    minAdx: 20,
  },
  'breakout-vol-bos': {
    id: 'breakout-vol-bos',
    label: 'Breakout + volume + BOS',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBreakout: true,
    requireHighVolume: true,
    requireBos: true,
  },
  'pattern-vol-adx': {
    id: 'pattern-vol-adx',
    label: 'Pattern breakout + volume + ADX',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireChartPatternBreakout: true,
    requireHighVolume: true,
    minAdx: 18,
    enableChartPatterns: true,
  },
  'breakout-rsi-vol': {
    id: 'breakout-rsi-vol',
    label: 'Breakout + volume + RSI 50–70',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBreakout: true,
    requireHighVolume: true,
    minRsi: 50,
    maxRsi: 70,
  },
  'breakout-macd-vol': {
    id: 'breakout-macd-vol',
    label: 'Breakout + volume + MACD',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBreakout: true,
    requireHighVolume: true,
    requireMacd: true,
  },
  'breakout-ema-vol': {
    id: 'breakout-ema-vol',
    label: 'Breakout + volume + EMA20',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBreakout: true,
    requireHighVolume: true,
    requireEmaTrend: true,
  },
  'breakout-tech-vol': {
    id: 'breakout-tech-vol',
    label: 'Breakout + volume + RSI/MACD/EMA',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBreakout: true,
    requireHighVolume: true,
    minRsi: 50,
    maxRsi: 75,
    requireMacd: true,
    requireEmaTrend: true,
  },
  'bollinger-vol': {
    id: 'bollinger-vol',
    label: 'Bollinger breakout + volume',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBollingerBreakout: true,
    requireHighVolume: true,
  },
  'bollinger-macd-vol': {
    id: 'bollinger-macd-vol',
    label: 'Bollinger + MACD + volume',
    entryMode: 'signal',
    timeframes: ['5m', '15m', '1h'],
    requireBollingerBreakout: true,
    requireHighVolume: true,
    requireMacd: true,
  },
};

/** Fast-entry presets grouped for PA-only drilldown / config UI. */
export const BENCHMARK_SIGNAL_PRESET_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  presetIds: readonly string[];
}> = [
  {
    id: 'breakout',
    label: 'Breakout & volume',
    presetIds: [
      'breakout-vol',
      'breakout-vol-bos',
      'breakout-bos',
      'breakout-adx',
    ],
  },
  {
    id: 'pattern',
    label: 'Chart pattern',
    presetIds: ['pattern-breakout-vol', 'pattern-vol-adx'],
  },
  {
    id: 'indicators',
    label: 'Breakout + indicators',
    presetIds: [
      'breakout-rsi-vol',
      'breakout-macd-vol',
      'breakout-ema-vol',
      'breakout-tech-vol',
    ],
  },
  {
    id: 'bollinger',
    label: 'Bollinger',
    presetIds: ['bollinger-vol', 'bollinger-macd-vol'],
  },
];

export function buildSignalPresetGroupsResponse(): Array<{
  id: string;
  label: string;
  presets: Array<{ id: string; label: string; gates: string[] }>;
}> {
  return BENCHMARK_SIGNAL_PRESET_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    presets: group.presetIds
      .map((id) => BENCHMARK_SIGNAL_PRESETS[id])
      .filter((preset): preset is BenchmarkSignalProfile => Boolean(preset))
      .map((preset) => ({
        id: preset.id,
        label: preset.label,
        gates: describeProfileGates(preset),
      })),
  }));
}

export const BENCHMARK_MATRIX_PRESETS = [
  'breakout-vol',
  'pattern-breakout-vol',
  'breakout-bos',
  'breakout-adx',
  'breakout-vol-bos',
  'pattern-vol-adx',
  'breakout-rsi-vol',
  'breakout-macd-vol',
  'breakout-ema-vol',
  'breakout-tech-vol',
  'bollinger-vol',
  'bollinger-macd-vol',
] as const;

/** Incremental stack: base breakout+vol → each indicator add-on → full tech combo. */
export const BENCHMARK_STACK_LADDER = [
  'breakout-vol',
  'breakout-rsi-vol',
  'breakout-macd-vol',
  'breakout-ema-vol',
  'breakout-tech-vol',
] as const;

/** Human-readable gate list for matrix UI / exports. */
export function describeProfileGates(
  profile: BenchmarkSignalProfile,
): string[] {
  if (profile.entryMode === 'engine' || profile.id === 'engine') {
    return ['PA-only conviction gates'];
  }

  const gates: string[] = [];
  if (profile.requireBreakout) gates.push('S/R breakout');
  if (profile.requireBollingerBreakout) gates.push('Bollinger breakout');
  if (profile.requireChartPatternBreakout) gates.push('Chart pattern breakout');
  if (profile.requireHighVolume) gates.push('High volume (1.5× avg)');
  if (profile.requireBos) gates.push('BOS aligned');
  if (profile.minAdx != null) gates.push(`ADX ≥ ${profile.minAdx}`);
  if (profile.minRsi != null && profile.maxRsi != null) {
    gates.push(`RSI ${profile.minRsi}–${profile.maxRsi}`);
  } else if (profile.minRsi != null) {
    gates.push(`RSI ≥ ${profile.minRsi}`);
  } else if (profile.maxRsi != null) {
    gates.push(`RSI ≤ ${profile.maxRsi}`);
  }
  if (profile.requireMacd) gates.push('MACD histogram');
  if (profile.requireEmaTrend) gates.push('Price vs EMA20');
  if (profile.timeframes?.length) {
    gates.push(`TF ${profile.timeframes.join('/')}`);
  }
  return gates.length ? gates : ['Signal gates (see preset)'];
}

export function resolveSignalProfile(
  idOrProfile?: string | BenchmarkSignalProfile,
): BenchmarkSignalProfile {
  if (!idOrProfile) return BENCHMARK_SIGNAL_PRESETS.engine;
  if (typeof idOrProfile !== 'string') return idOrProfile;
  const key = idOrProfile.toLowerCase().replace(/\s+/g, '-');
  return BENCHMARK_SIGNAL_PRESETS[key] ?? BENCHMARK_SIGNAL_PRESETS.engine;
}

export function parseSignalMatrixToken(token: string): string[] | null {
  const raw = token.toLowerCase();
  if (raw === 'matrix' || raw === 'matrix-all' || raw === 'combo-all') {
    return [...BENCHMARK_MATRIX_PRESETS];
  }
  if (
    raw === 'matrix-ladder' ||
    raw === 'matrix-stack' ||
    raw === 'combo-ladder' ||
    raw === 'matrix-tech'
  ) {
    return [...BENCHMARK_STACK_LADDER];
  }

  const prefix = 'matrix:';
  if (!raw.startsWith(prefix)) return null;
  const body = token.slice(prefix.length).trim().toLowerCase();
  if (!body) return [...BENCHMARK_MATRIX_PRESETS];
  if (
    body === 'ladder' ||
    body === 'stack' ||
    body === 'tech' ||
    body === 'combo-ladder'
  ) {
    return [...BENCHMARK_STACK_LADDER];
  }
  return body
    .split(/[,+]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Rough replay multiplier for matrix planning (sequential full replays). */
export function estimateMatrixRunCount(variantCount: number): {
  variants: number;
  note: string;
} {
  const variants = Math.max(1, variantCount);
  const minutes = variants * 2;
  return {
    variants,
    note:
      variants <= 5
        ? `~${minutes}–${variants * 6} min (≈${variants}× single run)`
        : variants <= 12
          ? `~${variants * 3}–${variants * 8} min — consider 14–30d for wide matrices`
          : `~${variants} full replays — use 14d shallow first; full permutation is usually too slow`,
  };
}

function primaryTimeframeForStyle(style: string): Timeframe {
  const s = style.toUpperCase();
  if (s === 'SCALPER') return '5m';
  if (s === 'POSITIONAL') return '1h';
  return '15m';
}

function isChartPatternBreakout(
  pattern: ChartPatternResult | undefined,
): { bull: boolean; bear: boolean } {
  if (!pattern || pattern.pattern === 'none') {
    return { bull: false, bear: false };
  }
  const confirmed = pattern.status === 'confirmed';
  const isBreakoutType = BREAKOUT_PATTERN_IDS.has(pattern.pattern);
  if (!confirmed && !isBreakoutType) {
    return { bull: false, bear: false };
  }
  return {
    bull: pattern.direction === 'bullish',
    bear: pattern.direction === 'bearish',
  };
}

function componentValue(
  snapshot: PriceActionResponse,
  tf: Timeframe,
  id: PaComponentId,
): number {
  const signals = snapshot.componentSignals?.[tf];
  if (!signals) return 0;
  return signals[id] ?? 0;
}

function passesComponentGates(
  snapshot: PriceActionResponse,
  tf: Timeframe,
  direction: 'bull' | 'bear',
  gates: BenchmarkSignalProfile['componentGates'],
): boolean {
  if (!gates) return true;
  const sign = direction === 'bull' ? 1 : -1;

  const rawValueKeys = new Set<PaComponentId>(['rsi', 'adx']);

  for (const [key, gate] of Object.entries(gates) as Array<
    [PaComponentId, NonNullable<BenchmarkSignalProfile['componentGates']>[PaComponentId]]
  >) {
    if (!gate) continue;
    const value = componentValue(snapshot, tf, key);
    if (rawValueKeys.has(key)) {
      if (gate.min != null && value < gate.min) return false;
      if (gate.max != null && value > gate.max) return false;
      continue;
    }
    if (gate.sign === 'bull' && value < 0) return false;
    if (gate.sign === 'bear' && value > 0) return false;
    if (gate.min != null && value * sign < gate.min) return false;
    if (gate.max != null && value * sign > gate.max) return false;
  }
  return true;
}

function evaluateTimeframe(
  snapshot: PriceActionResponse,
  tf: Timeframe,
  profile: BenchmarkSignalProfile,
): SignalProfileMatch | null {
  const breakout = componentValue(snapshot, tf, 'breakout');
  const volume = componentValue(snapshot, tf, 'volume');
  const retest = componentValue(snapshot, tf, 'retest');
  const bos = componentValue(snapshot, tf, 'bos');
  const adx = componentValue(snapshot, tf, 'adx');
  const rsi = componentValue(snapshot, tf, 'rsi');
  const macd = componentValue(snapshot, tf, 'macd');
  const emaTrend = componentValue(snapshot, tf, 'emaTrend');
  const bollinger = componentValue(snapshot, tf, 'bollinger');
  const pattern = snapshot.chartPatterns?.[tf];
  const patternBreak = isChartPatternBreakout(pattern);

  let direction: 'bull' | 'bear' | null = null;

  if (profile.requireBollingerBreakout) {
    if (bollinger > 0) direction = direction ?? 'bull';
    else if (bollinger < 0) direction = direction ?? 'bear';
    else return null;
  }

  if (profile.requireChartPatternBreakout) {
    if (patternBreak.bull) direction = 'bull';
    else if (patternBreak.bear) direction = 'bear';
    else return null;
  }

  if (profile.requireBreakout) {
    if (breakout > 0) direction = direction ?? 'bull';
    else if (breakout < 0) direction = direction ?? 'bear';
    else return null;
  }

  if (!direction) {
    if (breakout > 0) direction = 'bull';
    else if (breakout < 0) direction = 'bear';
    else if (patternBreak.bull) direction = 'bull';
    else if (patternBreak.bear) direction = 'bear';
    else return null;
  }

  if (profile.requireHighVolume && volume !== 1) return null;
  if (profile.requireRetest && retest !== 1) return null;
  if (profile.requireBos) {
    if (direction === 'bull' && bos <= 0) return null;
    if (direction === 'bear' && bos >= 0) return null;
  }
  if (profile.minAdx != null && adx < profile.minAdx) return null;

  if (profile.minRsi != null) {
    if (direction === 'bull' && rsi < profile.minRsi) return null;
    if (direction === 'bear' && rsi > 100 - profile.minRsi) return null;
  }
  if (profile.maxRsi != null) {
    if (direction === 'bull' && rsi > profile.maxRsi) return null;
    if (direction === 'bear' && rsi < profile.maxRsi) return null;
  }
  if (profile.requireMacd) {
    if (direction === 'bull' && macd <= 0) return null;
    if (direction === 'bear' && macd >= 0) return null;
  }
  if (profile.requireEmaTrend) {
    if (direction === 'bull' && emaTrend <= 0) return null;
    if (direction === 'bear' && emaTrend >= 0) return null;
  }

  if (!passesComponentGates(snapshot, tf, direction, profile.componentGates)) {
    return null;
  }

  const action: TradeAction = direction === 'bull' ? 'CE-BUY' : 'PE-BUY';
  const parts: string[] = [tf];
  if (profile.requireBreakout) parts.push('breakout');
  if (profile.requireHighVolume) parts.push('vol↑');
  if (profile.requireChartPatternBreakout && pattern) {
    parts.push(pattern.pattern.replace(/_/g, ' '));
  }
  if (profile.requireBos) parts.push('bos');
  if (profile.minAdx != null) parts.push(`adx≥${profile.minAdx}`);
  if (profile.minRsi != null || profile.maxRsi != null) {
    parts.push(
      `rsi${profile.minRsi != null ? `≥${profile.minRsi}` : ''}${
        profile.maxRsi != null ? `≤${profile.maxRsi}` : ''
      }`,
    );
  }
  if (profile.requireMacd) parts.push('macd');
  if (profile.requireEmaTrend) parts.push('ema20');
  if (profile.requireBollingerBreakout) parts.push('bb');

  return {
    action,
    timeframe: tf,
    reason: parts.join(' · '),
  };
}

export function evaluateSignalProfile(
  snapshot: PriceActionResponse,
  profile: BenchmarkSignalProfile,
  tradingStyle: string,
): SignalProfileMatch | null {
  if (profile.entryMode === 'engine' || profile.id === 'engine') {
    return null;
  }

  const tfs =
    profile.timeframes?.length
      ? profile.timeframes
      : [primaryTimeframeForStyle(tradingStyle)];

  for (const tf of tfs) {
    const match = evaluateTimeframe(snapshot, tf, profile);
    if (match) return match;
  }
  return null;
}

export function profileNeedsChartPatterns(
  profile: BenchmarkSignalProfile,
): boolean {
  return (
    profile.enableChartPatterns === true ||
    profile.requireChartPatternBreakout === true
  );
}