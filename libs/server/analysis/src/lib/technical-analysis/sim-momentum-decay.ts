import { FyersAPI } from 'fyers-api-v3';
import { TradeAction } from '@alpha-trader/server-shared';

/** Matches live deck threshold in trailing-tp-policy hold guidance. */
export const MOMENTUM_EXIT_MIN_PEAK_R = 1;
export const MOMENTUM_EXIT_DECAY_THRESHOLD = 25;

/**
 * Lightweight candle-only momentum decay proxy for benchmark replay
 * (no 15m structure / ADX — uses recent 5m bar direction vs trade side).
 */
export function computeSimMomentumDecayPercent(
  candles: FyersAPI.Candle[],
  endIndex: number,
  action: TradeAction,
  lookback = 3,
): number {
  const start = Math.max(0, endIndex - lookback + 1);
  const slice = candles.slice(start, endIndex + 1);
  if (slice.length < 2) return 0;

  let candleDir = 0;
  for (const c of slice) {
    if (c[4] > c[1]) candleDir += 1;
    else if (c[4] < c[1]) candleDir -= 1;
  }

  const opposed =
    (action === 'CE-BUY' && candleDir < 0) ||
    (action === 'PE-BUY' && candleDir > 0);
  if (!opposed) return 0;

  const severity = Math.min(1, Math.abs(candleDir) / slice.length);
  return Math.round(12 + severity * 16);
}