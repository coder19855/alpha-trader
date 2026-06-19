import type { DeckCandlePoint } from './deck-service.js';

const BAR_MS = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
} as const;

export function patchSpotCandlesWithLivePrice(
  candles: DeckCandlePoint[],
  ltp: number,
  barMs: number,
  nowMs = Date.now(),
): DeckCandlePoint[] {
  if (!candles.length || !Number.isFinite(ltp) || ltp <= 0) return candles;

  const last = candles[candles.length - 1];

  if (nowMs >= last.t && nowMs < last.t + barMs) {
    const updated: DeckCandlePoint = {
      ...last,
      c: ltp,
      h: Math.max(last.h, ltp),
      l: Math.min(last.l, ltp),
    };
    return [...candles.slice(0, -1), updated];
  }

  if (nowMs >= last.t + barMs) {
    let barOpen = last.t + barMs;
    while (barOpen + barMs <= nowMs) {
      barOpen += barMs;
    }
    return [...candles, { t: barOpen, o: ltp, h: ltp, l: ltp, c: ltp }];
  }

  return candles;
}

export function patchMultiTfSpotCandles(
  input: {
    spotCandles?: DeckCandlePoint[];
    spotCandles5m?: DeckCandlePoint[];
    spotCandles15m?: DeckCandlePoint[];
    spotCandles1h?: DeckCandlePoint[];
  },
  ltp: number,
  nowMs = Date.now(),
): {
  spotCandles?: DeckCandlePoint[];
  spotCandles5m?: DeckCandlePoint[];
  spotCandles15m?: DeckCandlePoint[];
  spotCandles1h?: DeckCandlePoint[];
} {
  if (!Number.isFinite(ltp) || ltp <= 0) return {};

  const patch: {
    spotCandles?: DeckCandlePoint[];
    spotCandles5m?: DeckCandlePoint[];
    spotCandles15m?: DeckCandlePoint[];
    spotCandles1h?: DeckCandlePoint[];
  } = {};

  if (input.spotCandles5m?.length) {
    patch.spotCandles5m = patchSpotCandlesWithLivePrice(
      input.spotCandles5m,
      ltp,
      BAR_MS['5m'],
      nowMs,
    );
  }
  if (input.spotCandles15m?.length) {
    patch.spotCandles15m = patchSpotCandlesWithLivePrice(
      input.spotCandles15m,
      ltp,
      BAR_MS['15m'],
      nowMs,
    );
  }
  if (input.spotCandles1h?.length) {
    patch.spotCandles1h = patchSpotCandlesWithLivePrice(
      input.spotCandles1h,
      ltp,
      BAR_MS['1h'],
      nowMs,
    );
  }
  if (input.spotCandles?.length) {
    const barMs = input.spotCandles5m?.length ? BAR_MS['5m'] : BAR_MS['15m'];
    patch.spotCandles = patchSpotCandlesWithLivePrice(
      input.spotCandles,
      ltp,
      barMs,
      nowMs,
    );
  }

  return patch;
}