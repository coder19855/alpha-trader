import { TradeAction } from '@alpha-trader/server-shared';

/** StockCharts default lookback; works on 5m intraday with Wilder smoothing. */
export const CHANDELIER_DEFAULT_PERIOD = 22;

/** 2.5–3× ATR is common for intraday; 3× gives more room on index moves. */
export const CHANDELIER_DEFAULT_ATR_MULT = 3;

/** Hybrid mode engages chandelier once peak reaches early BE lock. */
export const CHANDELIER_HYBRID_MIN_PEAK_R = 1.0;

export type BenchmarkExitPolicy =
  | 'rr-ladder'
  | 'breakeven-lock'
  | 'chandelier'
  | 'chandelier-hybrid'
  | 'atr-tighten'
  | 'partial-scale-50'
  | 'structure-trail'
  | 'momentum-decay-exit';

export const ATR_TIGHTEN_LOOSE_MULT = 3;
export const ATR_TIGHTEN_EARLY_MULT = 2.5;
export const ATR_TIGHTEN_TIGHT_MULT = 1.75;
export const ATR_TIGHTEN_EARLY_PEAK_R = 0.7;
export const ATR_TIGHTEN_ACTIVATE_PEAK_R = 1;

export const PARTIAL_SCALE_FRACTION = 0.5;
export const PARTIAL_SCALE_TP_R = 1.5;

export const BENCHMARK_EXIT_MATRIX_PRESETS: BenchmarkExitPolicy[] = [
  'rr-ladder',
  'breakeven-lock',
  'chandelier-hybrid',
  'atr-tighten',
  'partial-scale-50',
  'structure-trail',
  'momentum-decay-exit',
  'chandelier',
];

export function usesChandelierTrail(policy: BenchmarkExitPolicy): boolean {
  return (
    policy === 'chandelier' ||
    policy === 'chandelier-hybrid' ||
    policy === 'atr-tighten'
  );
}

export function resolveChandelierMultiplier(
  policy: BenchmarkExitPolicy,
  peakR: number,
  defaultMult: number,
): number {
  if (policy === 'atr-tighten') {
    if (peakR >= ATR_TIGHTEN_ACTIVATE_PEAK_R) {
      return ATR_TIGHTEN_TIGHT_MULT;
    }
    if (peakR >= ATR_TIGHTEN_EARLY_PEAK_R) {
      return ATR_TIGHTEN_EARLY_MULT;
    }
    return ATR_TIGHTEN_LOOSE_MULT;
  }
  return defaultMult;
}

export function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose),
  );
}

export function updateWilderAtr(
  prevAtr: number,
  tr: number,
  period: number,
): number {
  return ((period - 1) * prevAtr + tr) / period;
}

export interface ChandelierState {
  /** Highest high (CE) or lowest low (PE) since entry. */
  extreme: number;
  stopPrice: number;
  atr: number;
}

export function chandelierStopFromExtreme(
  action: TradeAction,
  extreme: number,
  atr: number,
  multiplier: number,
): number {
  if (action === 'CE-BUY') return +(extreme - atr * multiplier).toFixed(2);
  if (action === 'PE-BUY') return +(extreme + atr * multiplier).toFixed(2);
  return extreme;
}

export function initChandelierState(
  action: TradeAction,
  entry: number,
  seedAtr: number,
  multiplier: number,
): ChandelierState {
  const extreme = entry;
  const stopPrice = chandelierStopFromExtreme(
    action,
    extreme,
    seedAtr,
    multiplier,
  );
  return { extreme, stopPrice, atr: seedAtr };
}

export function updateChandelierState(
  action: TradeAction,
  state: ChandelierState,
  high: number,
  low: number,
  prevClose: number,
  atrPeriod: number,
  multiplier: number,
): ChandelierState {
  const tr = trueRange(high, low, prevClose);
  const atr = updateWilderAtr(state.atr, tr, atrPeriod);
  const extreme =
    action === 'CE-BUY'
      ? Math.max(state.extreme, high)
      : action === 'PE-BUY'
        ? Math.min(state.extreme, low)
        : state.extreme;
  const rawStop = chandelierStopFromExtreme(action, extreme, atr, multiplier);
  const stopPrice =
    action === 'CE-BUY'
      ? Math.max(state.stopPrice, rawStop)
      : action === 'PE-BUY'
        ? Math.min(state.stopPrice, rawStop)
        : rawStop;
  return { extreme, stopPrice, atr };
}

/** Tighter protective stop: higher for CE, lower for PE. */
export function tighterStopPrice(
  action: TradeAction,
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  if (action === 'CE-BUY') return Math.max(a, b);
  if (action === 'PE-BUY') return Math.min(a, b);
  return a;
}

export function isCloseThroughStop(
  action: TradeAction,
  stopPrice: number,
  close: number,
): boolean {
  if (action === 'CE-BUY') return close <= stopPrice;
  if (action === 'PE-BUY') return close >= stopPrice;
  return false;
}

export function isChandelierActive(
  action: TradeAction,
  stopPrice: number,
  hardStopLoss: number,
): boolean {
  if (action === 'CE-BUY') return stopPrice > hardStopLoss;
  if (action === 'PE-BUY') return stopPrice < hardStopLoss;
  return false;
}

export function describeExitPolicy(policy: BenchmarkExitPolicy): string {
  if (policy === 'chandelier') {
    return `Chandelier exit (${CHANDELIER_DEFAULT_PERIOD}-bar ATR × ${CHANDELIER_DEFAULT_ATR_MULT}) — ratcheting HH/LL −/+ ATR trail; close breach.`;
  }
  if (policy === 'breakeven-lock') {
    return 'Break-even lock — after 1R peak, stop moves to entry and stays there until 1.5R, then resumes the R:R ratchet. Useful for protecting early wins without tightening too fast.';
  }
  if (policy === 'chandelier-hybrid') {
    return `Hybrid exit — R:R ladder + tighter Chandelier (${CHANDELIER_DEFAULT_ATR_MULT}× ATR) after ${CHANDELIER_HYBRID_MIN_PEAK_R}R peak.`;
  }
  if (policy === 'atr-tighten') {
    return `ATR tighten — ${ATR_TIGHTEN_LOOSE_MULT}× ATR until ${ATR_TIGHTEN_EARLY_PEAK_R}R peak, then ${ATR_TIGHTEN_EARLY_MULT}× ATR until ${ATR_TIGHTEN_ACTIVATE_PEAK_R}R, then ${ATR_TIGHTEN_TIGHT_MULT}× ATR ratchet.`;
  }
  if (policy === 'partial-scale-50') {
    return `Partial scale-out — bank ${PARTIAL_SCALE_FRACTION * 100}% at ${PARTIAL_SCALE_TP_R}R; trail remainder on R:R ladder.`;
  }
  if (policy === 'structure-trail') {
    return 'Structure trail — last pullback swing ± 2× ATR (1.5× after 1.5R peak) under R:R floor after 1R peak.';
  }
  if (policy === 'momentum-decay-exit') {
    return `Momentum decay exit — market exit when peak ≥${1}R and 5m decay ≥25%.`;
  }
  return 'R:R ladder — 1R BE lock → 1R/1.5R/2.5R/4R floors; past 4R ratchets peak − 1R.';
}