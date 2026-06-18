import { TradeAction } from '@alpha-trader/server-shared';

/** Wider buffer before extension; tightens after peak reaches 1.5R. */
export const STRUCTURE_TRAIL_ATR_BUFFER_LOOSE = 2;
export const STRUCTURE_TRAIL_ATR_BUFFER_TIGHT = 1.5;
export const STRUCTURE_TRAIL_ATR_TIGHTEN_PEAK_R = 1.5;

/** @deprecated Use resolveStructureTrailAtrBuffer — kept for imports expecting a single multiplier. */
export const STRUCTURE_TRAIL_ATR_BUFFER = STRUCTURE_TRAIL_ATR_BUFFER_TIGHT;

export function resolveStructureTrailAtrBuffer(peakR: number): number {
  return peakR >= STRUCTURE_TRAIL_ATR_TIGHTEN_PEAK_R
    ? STRUCTURE_TRAIL_ATR_BUFFER_TIGHT
    : STRUCTURE_TRAIL_ATR_BUFFER_LOOSE;
}

export interface StructureTrailState {
  extreme: number;
  pullbackLow: number;
  lastSwingLow: number;
  stopPrice: number;
}

export function structureStopFromSwing(
  action: TradeAction,
  swingLevel: number,
  atr: number,
  buffer = STRUCTURE_TRAIL_ATR_BUFFER_TIGHT,
): number {
  if (action === 'CE-BUY') return +(swingLevel - atr * buffer).toFixed(2);
  if (action === 'PE-BUY') return +(swingLevel + atr * buffer).toFixed(2);
  return swingLevel;
}

export function initStructureTrailState(
  action: TradeAction,
  entry: number,
  atr: number,
  peakR = 0,
): StructureTrailState {
  const lastSwingLow = entry;
  const buffer = resolveStructureTrailAtrBuffer(peakR);
  return {
    extreme: entry,
    pullbackLow: entry,
    lastSwingLow,
    stopPrice: structureStopFromSwing(action, lastSwingLow, atr, buffer),
  };
}

export function updateStructureTrailState(
  action: TradeAction,
  state: StructureTrailState,
  high: number,
  low: number,
  atr: number,
  peakR = 0,
): StructureTrailState {
  const buffer = resolveStructureTrailAtrBuffer(peakR);

  if (action === 'CE-BUY') {
    let { extreme, pullbackLow, lastSwingLow } = state;
    if (high > extreme) {
      lastSwingLow = pullbackLow;
      extreme = high;
      pullbackLow = low;
    } else {
      pullbackLow = Math.min(pullbackLow, low);
    }
    const rawStop = structureStopFromSwing(action, lastSwingLow, atr, buffer);
    return {
      extreme,
      pullbackLow,
      lastSwingLow,
      stopPrice: Math.max(state.stopPrice, rawStop),
    };
  }

  if (action === 'PE-BUY') {
    let { extreme, pullbackLow, lastSwingLow } = state;
    if (low < extreme) {
      lastSwingLow = pullbackLow;
      extreme = low;
      pullbackLow = high;
    } else {
      pullbackLow = Math.max(pullbackLow, high);
    }
    const rawStop = structureStopFromSwing(action, lastSwingLow, atr, buffer);
    return {
      extreme,
      pullbackLow,
      lastSwingLow,
      stopPrice: Math.min(state.stopPrice, rawStop),
    };
  }

  return state;
}

export function isStructureTrailActive(
  action: TradeAction,
  stopPrice: number,
  hardStopLoss: number,
): boolean {
  if (action === 'CE-BUY') return stopPrice > hardStopLoss;
  if (action === 'PE-BUY') return stopPrice < hardStopLoss;
  return false;
}