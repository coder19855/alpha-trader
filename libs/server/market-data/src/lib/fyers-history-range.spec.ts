import {
  buildHistoryChunkRanges,
  FYERS_HISTORY_MAX_DAYS_PER_REQUEST,
  mergeFyersCandles,
} from './fyers-history-range';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('fyers history range', () => {
  it('keeps short windows in a single chunk', () => {
    const fromMs = 1_000_000;
    const toMs = fromMs + 30 * MS_PER_DAY;
    expect(buildHistoryChunkRanges(fromMs, toMs)).toEqual([{ fromMs, toMs }]);
  });

  it('splits 125-day windows into two <=100-day chunks', () => {
    const fromMs = 0;
    const toMs = 125 * MS_PER_DAY;
    const chunks = buildHistoryChunkRanges(fromMs, toMs);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].toMs - chunks[0].fromMs).toBeLessThanOrEqual(
      FYERS_HISTORY_MAX_DAYS_PER_REQUEST * MS_PER_DAY,
    );
    expect(chunks[1].toMs).toBe(toMs);
  });

  it('merges and dedupes candles by timestamp', () => {
    const merged = mergeFyersCandles([
      [
        [100, 1, 2, 0.5, 1.5],
        [200, 1, 2, 0.5, 1.5],
      ],
      [
        [200, 9, 9, 9, 9],
        [300, 1, 2, 0.5, 1.5],
      ],
    ]);
    expect(merged.map((c) => c[0])).toEqual([100, 200, 300]);
    expect(merged[1][1]).toBe(9);
  });
});