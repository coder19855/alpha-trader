import { FyersAPI } from 'fyers-api-v3';

const BAR_SEC = {
  '5': 300,
  '15': 900,
  '60': 3600,
} as const;

export function patchFyersCandlesWithLtp(
  candles: FyersAPI.Candle[],
  ltp: number,
  resolution: keyof typeof BAR_SEC | string,
  nowSec = Math.floor(Date.now() / 1000),
): FyersAPI.Candle[] {
  if (!candles.length || !Number.isFinite(ltp) || ltp <= 0) return candles;

  const barSec = BAR_SEC[resolution as keyof typeof BAR_SEC];
  if (!barSec) return candles;

  const last = candles[candles.length - 1];
  const lastT = last[0];

  if (nowSec >= lastT && nowSec < lastT + barSec) {
    const updated: FyersAPI.Candle = [
      lastT,
      last[1],
      Math.max(last[2], ltp),
      Math.min(last[3], ltp),
      ltp,
      last[5],
    ];
    return [...candles.slice(0, -1), updated];
  }

  if (nowSec >= lastT + barSec) {
    let barOpen = lastT + barSec;
    while (barOpen + barSec <= nowSec) {
      barOpen += barSec;
    }
    return [...candles, [barOpen, ltp, ltp, ltp, ltp, 0]];
  }

  return candles;
}

export function patchLiveHistoryCandles(
  symbol: string,
  candlesByResolution: Record<'5' | '15' | '60', FyersAPI.Candle[]>,
  ltp: number | null | undefined,
  nowSec = Math.floor(Date.now() / 1000),
): Record<'5' | '15' | '60', FyersAPI.Candle[]> {
  if (ltp == null || !Number.isFinite(ltp) || ltp <= 0 || !symbol.includes('-INDEX')) {
    return candlesByResolution;
  }

  return {
    '5': patchFyersCandlesWithLtp(candlesByResolution['5'], ltp, '5', nowSec),
    '15': patchFyersCandlesWithLtp(candlesByResolution['15'], ltp, '15', nowSec),
    '60': patchFyersCandlesWithLtp(candlesByResolution['60'], ltp, '60', nowSec),
  };
}