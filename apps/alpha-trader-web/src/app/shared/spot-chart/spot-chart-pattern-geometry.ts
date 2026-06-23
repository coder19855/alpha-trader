export type ChartTf = '5m' | '15m' | '1h';

export interface SpotCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface PatternPivot {
  index: number;
  price: number;
  kind: 'high' | 'low';
  t?: number;
}

export interface PatternInsight {
  timeframe: string;
  pattern: string;
  tone: string;
  label: string;
  status?: string;
  biasLabel?: string;
  type?: 'chart' | 'candlestick';
  neckline?: number;
  points?: PatternPivot[];
}

function normalizeLabel(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeTimeframe(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

export interface PatternDrawOp {
  id: string;
  kind:
    | 'polyline'
    | 'polygon'
    | 'hline'
    | 'marker'
    | 'text'
    | 'dot'
    | 'candleHighlight';
  points: Array<{ t: number; price: number }>;
  color: string;
  fill?: string;
  dashed?: boolean;
  label?: string;
  strokeWidth?: number;
  markerBullish?: boolean;
  candle?: SpotCandle;
  highlighted?: boolean;
}

function normalizePatternName(pattern: string): string {
  return pattern.toLowerCase().replace(/\s+/g, '_');
}

export function isValidChartPattern(insight: PatternInsight): boolean {
  if (
    insight.type === 'candlestick' ||
    normalizeLabel(insight.label) === 'candlestick'
  ) {
    return false;
  }
  if (
    insight.type &&
    insight.type !== 'chart' &&
    normalizeLabel(insight.label) !== 'chart pattern'
  ) {
    return false;
  }
  const name = normalizePatternName(insight.pattern);
  if (!name || name === 'none') return false;
  if (insight.status && !['forming', 'confirmed'].includes(insight.status)) return false;
  return true;
}

export function selectChartPatternsToPlot(
  insights: PatternInsight[],
  activeTf: ChartTf,
): PatternInsight[] {
  const active = normalizeTimeframe(activeTf);
  return insights
    .filter(isValidChartPattern)
    .filter((row) => normalizeTimeframe(row.timeframe) === active)
    .sort((a, b) => patternRecencyRank(b) - patternRecencyRank(a))
}

function patternRecencyRank(insight: PatternInsight): number {
  let rank = 0;
  if (insight.status === 'confirmed') rank += 2;
  else if (insight.status === 'forming') rank += 1;
  return rank;
}

export function candlestickInsightForTf(
  insights: PatternInsight[],
  activeTf: ChartTf,
): PatternInsight | null {
  const active = normalizeTimeframe(activeTf);
  return (
    insights.find(
      (row) =>
        (row.type === 'candlestick' ||
          normalizeLabel(row.label) === 'candlestick') &&
        normalizeTimeframe(row.timeframe) === active &&
        row.pattern &&
        !/^none$/i.test(row.pattern),
    ) ?? null
  );
}

export function resolvePatternColor(pattern?: string, tone?: string): string {
  const normalized = normalizePatternName(pattern ?? '');
  if (
    normalized.includes('double_top') ||
    normalized.includes('head_and_shoulders') ||
    normalized.includes('rising_wedge') ||
    normalized.includes('bear_flag') ||
    normalized.includes('descending') ||
    normalized.includes('range_breakout_bear') ||
    normalized.includes('trendline_break_bear')
  ) {
    return '#ef4444';
  }
  if (
    normalized.includes('double_bottom') ||
    normalized.includes('inverse_head') ||
    normalized.includes('falling_wedge') ||
    normalized.includes('bull_flag') ||
    normalized.includes('ascending') ||
    normalized.includes('range_breakout_bull') ||
    normalized.includes('trendline_break_bull')
  ) {
    return '#22c55e';
  }
  if ((tone ?? '').toLowerCase() === 'bear') return '#fb923c';
  if ((tone ?? '').toLowerCase() === 'bull') return '#4ade80';
  return '#a78bfa';
}

type Pivot = { index: number; price: number; kind: 'high' | 'low' };

function findSwingLows(candles: SpotCandle[], window = 1): Pivot[] {
  const swings: Pivot[] = [];
  for (let i = window; i < candles.length - window; i += 1) {
    const low = candles[i].l;
    let isSwing = true;
    for (let j = 1; j <= window; j += 1) {
      if (candles[i - j].l <= low || candles[i + j].l <= low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) swings.push({ index: i, price: low, kind: 'low' });
  }
  return swings;
}

function findSwingHighs(candles: SpotCandle[], window = 1): Pivot[] {
  const swings: Pivot[] = [];
  for (let i = window; i < candles.length - window; i += 1) {
    const high = candles[i].h;
    let isSwing = true;
    for (let j = 1; j <= window; j += 1) {
      if (candles[i - j].h >= high || candles[i + j].h >= high) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) swings.push({ index: i, price: high, kind: 'high' });
  }
  return swings;
}

function candlePoint(candles: SpotCandle[], index: number): { t: number; price: number } {
  return { t: candles[index].t, price: candles[index].c };
}

function pivotPoint(candles: SpotCandle[], pivot: Pivot): { t: number; price: number } {
  return { t: candles[pivot.index].t, price: pivot.price };
}

function snapPointToCandles(
  candles: SpotCandle[],
  point: { t: number; price: number },
): { t: number; price: number } {
  if (!candles.length) return point;

  const targetSec = Math.floor(point.t / 1000);
  const exact = candles.find((candle) => Math.floor(candle.t / 1000) === targetSec);
  if (exact) return { t: exact.t, price: point.price };

  let nearest = candles[0];
  let minDist = Math.abs(candles[0].t - point.t);
  for (const candle of candles) {
    const dist = Math.abs(candle.t - point.t);
    if (dist < minDist) {
      minDist = dist;
      nearest = candle;
    }
  }
  return { t: nearest.t, price: point.price };
}

function resolveServerCoords(
  candles: SpotCandle[],
  points?: PatternPivot[],
): Array<{ t: number; price: number }> {
  if (!points?.length) return [];
  const out: Array<{ t: number; price: number }> = [];
  for (const pt of points) {
    if (pt.t != null && Number.isFinite(pt.t)) {
      out.push(snapPointToCandles(candles, { t: pt.t, price: pt.price }));
      continue;
    }
    if (pt.index >= 0 && pt.index < candles.length) {
      out.push({ t: candles[pt.index].t, price: pt.price });
      continue;
    }
    if (pt.index >= 0 && candles.length) {
      const clamped = Math.min(candles.length - 1, pt.index);
      out.push({ t: candles[clamped].t, price: pt.price });
    }
  }
  return out;
}

function addPivotDots(
  ops: PatternDrawOp[],
  id: string,
  coords: Array<{ t: number; price: number }>,
  color: string,
): void {
  coords.forEach((coord, i) => {
    ops.push({
      id: `${id}-dot-${i}`,
      kind: 'dot',
      points: [coord],
      color,
      strokeWidth: 2,
    });
  });
}

function lineBetween(
  candles: SpotCandle[],
  fromIdx: number,
  fromPrice: number,
  toIdx: number,
  toPrice: number,
  extendBars = 4,
): Array<{ t: number; price: number }> {
  if (!candles.length || fromIdx === toIdx) return [];
  const slope = (toPrice - fromPrice) / (toIdx - fromIdx);
  const start = Math.max(0, Math.min(fromIdx, toIdx) - extendBars);
  const end = Math.min(candles.length - 1, Math.max(fromIdx, toIdx) + extendBars);
  const points: Array<{ t: number; price: number }> = [];
  for (let i = start; i <= end; i += 1) {
    const price = fromPrice + slope * (i - fromIdx);
    points.push({ t: candles[i].t, price: +price.toFixed(2) });
  }
  return points;
}

function boxFromWindow(
  candles: SpotCandle[],
  startIdx: number,
  endIdx: number,
): Array<{ t: number; price: number }> {
  const slice = candles.slice(startIdx, endIdx + 1);
  if (!slice.length) return [];
  const high = Math.max(...slice.map((c) => c.h));
  const low = Math.min(...slice.map((c) => c.l));
  const t0 = slice[0].t;
  const t1 = slice[slice.length - 1].t;
  return [
    { t: t0, price: high },
    { t: t1, price: high },
    { t: t1, price: low },
    { t: t0, price: low },
  ];
}

function addNecklineOp(
  ops: PatternDrawOp[],
  id: string,
  candles: SpotCandle[],
  neckline: number,
  color: string,
): void {
  if (!Number.isFinite(neckline) || !candles.length) return;
  const start = candles[Math.max(0, candles.length - 28)].t;
  const end = candles[candles.length - 1].t;
  ops.push({
    id,
    kind: 'hline',
    points: [
      { t: start, price: neckline },
      { t: end, price: neckline },
    ],
    color,
    dashed: true,
    label: 'Neckline',
    strokeWidth: 1.5,
  });
}

function buildFromServerPoints(
  insight: PatternInsight,
  candles: SpotCandle[],
  normalized: string,
  color: string,
  neckline?: number,
): PatternDrawOp[] | null {
  const coords = resolveServerCoords(candles, insight.points);
  if (coords.length < 2) return null;

  const ops: PatternDrawOp[] = [];

  if (
    normalized.includes('double_top') ||
    normalized.includes('double_bottom') ||
    normalized.includes('head_and_shoulders') ||
    normalized.includes('inverse_head') ||
    normalized.includes('trendline_break')
  ) {
    ops.push({
      id: 'server-outline',
      kind: 'polyline',
      points: coords,
      color,
      strokeWidth: 2,
      label: insight.pattern,
    });
    addPivotDots(ops, 'server-outline', coords, color);
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'server-neck', candles, neckline!, color);
    return ops;
  }

  if (normalized.includes('wedge') || normalized.includes('triangle')) {
    if (coords.length >= 4) {
      ops.push({
        id: 'server-upper',
        kind: 'polyline',
        points: [coords[0], coords[1]],
        color,
        strokeWidth: 2,
      });
      ops.push({
        id: 'server-lower',
        kind: 'polyline',
        points: [coords[2], coords[3]],
        color,
        strokeWidth: 2,
        label: insight.pattern,
      });
      addPivotDots(ops, 'server-boundary', coords.slice(0, 4), color);
      if (Number.isFinite(neckline)) addNecklineOp(ops, 'server-neck', candles, neckline!, color);
      return ops;
    }
  }

  if (normalized.includes('flag') && coords.length >= 6) {
    ops.push({
      id: 'server-pole',
      kind: 'polyline',
      points: [coords[0], coords[1]],
      color,
      strokeWidth: 2,
    });
    ops.push({
      id: 'server-box',
      kind: 'polygon',
      points: coords.slice(2, 6),
      color,
      fill: `${color}22`,
      strokeWidth: 1.5,
      label: insight.pattern,
    });
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'server-neck', candles, neckline!, color);
    return ops;
  }

  if (normalized.includes('range_breakout') && coords.length >= 4) {
    ops.push({
      id: 'server-range-high',
      kind: 'polyline',
      points: [coords[0], coords[1]],
      color,
      strokeWidth: 1.5,
      dashed: true,
    });
    ops.push({
      id: 'server-range-low',
      kind: 'polyline',
      points: [coords[2], coords[3]],
      color,
      strokeWidth: 1.5,
      dashed: true,
      label: insight.pattern,
    });
    return ops;
  }

  ops.push({
    id: 'server-generic',
    kind: 'polyline',
    points: coords,
    color,
    strokeWidth: 2,
    label: insight.pattern,
  });
  addPivotDots(ops, 'server-generic', coords, color);
  if (Number.isFinite(neckline)) addNecklineOp(ops, 'server-neck', candles, neckline!, color);
  return ops;
}

export function buildChartPatternOps(
  insight: PatternInsight,
  candles: SpotCandle[],
  fallbackNeckline?: number,
): PatternDrawOp[] {
  if (!candles.length) return [];

  const color = resolvePatternColor(insight.pattern, insight.tone);
  const normalized = normalizePatternName(insight.pattern);
  const neckline = insight.neckline ?? fallbackNeckline;

  const fromServer = buildFromServerPoints(insight, candles, normalized, color, neckline);
  if (fromServer?.length) return fromServer;

  const ops: PatternDrawOp[] = [];
  const highs = findSwingHighs(candles);
  const lows = findSwingLows(candles);

  if (normalized.includes('double_top') && highs.length >= 2) {
    const h1 = highs[highs.length - 2];
    const h2 = highs[highs.length - 1];
    const peaks = [pivotPoint(candles, h1), pivotPoint(candles, h2)];
    ops.push({
      id: 'dt-peaks',
      kind: 'polyline',
      points: peaks,
      color,
      strokeWidth: 2,
      label: insight.pattern,
    });
    addPivotDots(ops, 'dt-peaks', peaks, color);
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'dt-neck', candles, neckline!, color);
    return ops;
  }

  if (normalized.includes('double_bottom') && lows.length >= 2) {
    const l1 = lows[lows.length - 2];
    const l2 = lows[lows.length - 1];
    const troughs = [pivotPoint(candles, l1), pivotPoint(candles, l2)];
    ops.push({
      id: 'db-troughs',
      kind: 'polyline',
      points: troughs,
      color,
      strokeWidth: 2,
      label: insight.pattern,
    });
    addPivotDots(ops, 'db-troughs', troughs, color);
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'db-neck', candles, neckline!, color);
    return ops;
  }

  if (normalized.includes('head_and_shoulders') && highs.length >= 3) {
    const left = highs[highs.length - 3];
    const head = highs[highs.length - 2];
    const right = highs[highs.length - 1];
    const outline = [
      pivotPoint(candles, left),
      pivotPoint(candles, head),
      pivotPoint(candles, right),
    ];
    ops.push({
      id: 'hs-outline',
      kind: 'polyline',
      points: outline,
      color,
      strokeWidth: 2,
      label: insight.pattern,
    });
    addPivotDots(ops, 'hs-outline', outline, color);
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'hs-neck', candles, neckline!, color);
    return ops;
  }

  if (normalized.includes('inverse_head') && lows.length >= 3) {
    const left = lows[lows.length - 3];
    const head = lows[lows.length - 2];
    const right = lows[lows.length - 1];
    const outline = [
      pivotPoint(candles, left),
      pivotPoint(candles, head),
      pivotPoint(candles, right),
    ];
    ops.push({
      id: 'ihs-outline',
      kind: 'polyline',
      points: outline,
      color,
      strokeWidth: 2,
      label: insight.pattern,
    });
    addPivotDots(ops, 'ihs-outline', outline, color);
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'ihs-neck', candles, neckline!, color);
    return ops;
  }

  if (normalized.includes('wedge') && candles.length >= 20) {
    const window = candles.slice(-20);
    const early = window.slice(0, 8);
    const late = window.slice(-8);
    const earlyHigh = Math.max(...early.map((c) => c.h));
    const lateHigh = Math.max(...late.map((c) => c.h));
    const earlyLow = Math.min(...early.map((c) => c.l));
    const lateLow = Math.min(...late.map((c) => c.l));
    const startIdx = candles.length - 20;
    const midIdx = candles.length - 10;
    const endIdx = candles.length - 1;
    ops.push({
      id: 'wedge-upper',
      kind: 'polyline',
      points: lineBetween(candles, startIdx, earlyHigh, endIdx, lateHigh, 2),
      color,
      strokeWidth: 2,
    });
    ops.push({
      id: 'wedge-lower',
      kind: 'polyline',
      points: lineBetween(candles, startIdx, earlyLow, midIdx, lateLow, 2),
      color,
      strokeWidth: 2,
      label: insight.pattern,
    });
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'wedge-neck', candles, neckline!, color);
    return ops;
  }

  if (normalized.includes('triangle') && candles.length >= 16) {
    const window = candles.slice(-16);
    const early = window.slice(0, 5);
    const late = window.slice(-5);
    const earlyHigh = Math.max(...early.map((c) => c.h));
    const lateHigh = Math.max(...late.map((c) => c.h));
    const earlyLow = Math.min(...early.map((c) => c.l));
    const lateLow = Math.min(...late.map((c) => c.l));
    const startIdx = candles.length - 16;
    const endIdx = candles.length - 1;
    ops.push({
      id: 'tri-upper',
      kind: 'polyline',
      points: lineBetween(candles, startIdx, earlyHigh, endIdx, lateHigh, 1),
      color,
      strokeWidth: 2,
    });
    ops.push({
      id: 'tri-lower',
      kind: 'polyline',
      points: lineBetween(candles, startIdx, earlyLow, endIdx, lateLow, 1),
      color,
      strokeWidth: 2,
      label: insight.pattern,
    });
    return ops;
  }

  if (normalized.includes('flag') && candles.length >= 24) {
    const consStart = candles.length - 10;
    const consEnd = candles.length - 2;
    const poleStart = candles.length - 24;
    const poleEnd = consStart;
    ops.push({
      id: 'flag-pole',
      kind: 'polyline',
      points: [candlePoint(candles, poleStart), candlePoint(candles, poleEnd)],
      color,
      strokeWidth: 2,
    });
    ops.push({
      id: 'flag-box',
      kind: 'polygon',
      points: boxFromWindow(candles, consStart, consEnd),
      color,
      fill: `${color}22`,
      strokeWidth: 1.5,
      label: insight.pattern,
    });
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'flag-neck', candles, neckline!, color);
    return ops;
  }

  const pivots = [...highs, ...lows].sort((a, b) => a.index - b.index).slice(-5);
  if (pivots.length >= 2) {
    const generic = pivots.map((p) => pivotPoint(candles, p));
    ops.push({
      id: 'generic-outline',
      kind: 'polyline',
      points: generic,
      color,
      strokeWidth: 2,
      label: insight.pattern,
    });
    addPivotDots(ops, 'generic-outline', generic, color);
    if (Number.isFinite(neckline)) addNecklineOp(ops, 'generic-neck', candles, neckline!, color);
  }

  return ops;
}

const THREE_CANDLE_PATTERNS = new Set([
  'morning_star',
  'evening_star',
  'three_white_soldiers',
  'three_black_crows',
]);

const TWO_CANDLE_PATTERNS = new Set([
  'bullish_engulfing',
  'bearish_engulfing',
  'bullish_harami',
  'bearish_harami',
  'piercing_line',
  'dark_cloud_cover',
]);

export function candleBarCountForPattern(pattern: string): number {
  const normalized = normalizePatternName(pattern);
  if (THREE_CANDLE_PATTERNS.has(normalized)) return 3;
  if (TWO_CANDLE_PATTERNS.has(normalized)) return 2;
  return 1;
}

export function resolveCandlestickCandles(
  insight: PatternInsight,
  candles: SpotCandle[],
): SpotCandle[] {
  if (!candles.length) return [];
  const count = candleBarCountForPattern(insight.pattern);
  return candles.slice(Math.max(0, candles.length - count));
}

export function collectPatternTimeBounds(
  insights: PatternInsight[],
  activeTf: ChartTf,
  candles: SpotCandle[],
  fallbackNeckline?: number,
): { startMs: number; endMs: number } | null {
  if (!candles.length) return null;
  const times: number[] = [];

  for (const [index, insight] of selectChartPatternsToPlot(insights, activeTf).entries()) {
    const neckline =
      index === 0 && Number.isFinite(fallbackNeckline) ? fallbackNeckline : undefined;
    const ops = buildChartPatternOps(insight, candles, neckline);
    for (const op of ops) {
      for (const point of op.points) {
        if (Number.isFinite(point.t)) times.push(point.t);
      }
    }
  }

  const candlestick = candlestickInsightForTf(insights, activeTf);
  if (candlestick) {
    for (const candle of resolveCandlestickCandles(candlestick, candles)) {
      times.push(candle.t);
    }
  }

  if (!times.length) return null;
  times.sort((a, b) => a - b);
  return { startMs: times[0], endMs: times[times.length - 1] };
}

export function buildCandlestickMarkerOp(
  insight: PatternInsight,
  candles: SpotCandle[],
  highlighted = false,
): PatternDrawOp | null {
  const patternCandles = resolveCandlestickCandles(insight, candles);
  if (!patternCandles.length) return null;
  const anchor = patternCandles[patternCandles.length - 1];
  const color = resolvePatternColor(insight.pattern, insight.tone);
  const bullish = insight.tone === 'bull';
  const markerPrice = bullish ? anchor.l : anchor.h;
  return {
    id: 'candlestick-marker',
    kind: 'marker',
    points: [{ t: anchor.t, price: markerPrice }],
    color,
    label: insight.pattern,
    strokeWidth: highlighted ? 3 : 2,
    markerBullish: bullish,
    highlighted,
  };
}

export function buildCandlestickHighlightOps(
  insight: PatternInsight,
  candles: SpotCandle[],
  highlighted = false,
): PatternDrawOp[] {
  const patternCandles = resolveCandlestickCandles(insight, candles);
  if (!patternCandles.length) return [];

  const color = resolvePatternColor(insight.pattern, insight.tone);
  return patternCandles.map((candle, index) => ({
    id: `candlestick-highlight-${index}`,
    kind: 'candleHighlight' as const,
    points: [
      { t: candle.t, price: candle.h },
      { t: candle.t, price: candle.l },
    ],
    color,
    fill: highlighted ? `${color}55` : `${color}33`,
    strokeWidth: highlighted ? 2.5 : 1.5,
    candle,
    highlighted,
  }));
}