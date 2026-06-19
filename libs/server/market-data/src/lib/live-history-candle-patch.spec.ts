import {
  patchFyersCandlesWithLtp,
  patchLiveHistoryCandles,
} from './live-history-candle-patch';

describe('live-history-candle-patch', () => {
  it('updates the forming Fyers candle', () => {
    const candles: Array<[number, number, number, number, number, number]> = [
      [1_000, 100, 101, 99, 100, 10],
    ];
    const patched = patchFyersCandlesWithLtp(candles, 102, '5', 1_100);
    expect(patched[0][2]).toBe(102);
    expect(patched[0][4]).toBe(102);
  });

  it('patches all index resolutions', () => {
    const base = {
      '5': [[1_000, 1, 1, 1, 1, 0] as [number, number, number, number, number, number]],
      '15': [[2_000, 2, 2, 2, 2, 0] as [number, number, number, number, number, number]],
      '60': [[3_000, 3, 3, 3, 3, 0] as [number, number, number, number, number, number]],
    };
    const patched = patchLiveHistoryCandles('NSE:NIFTY50-INDEX', base, 50, 1_100);
    expect(patched['5'][0][4]).toBe(50);
    expect(patched['15'][0][4]).toBe(2);
    expect(patched['60'][0][4]).toBe(3);
  });
});