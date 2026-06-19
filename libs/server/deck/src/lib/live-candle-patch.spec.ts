import {
  patchMultiTfSpotCandles,
  patchSpotCandlesWithLivePrice,
} from './live-candle-patch';

describe('live-candle-patch', () => {
  it('updates the forming bar close/high/low', () => {
    const candles = [{ t: 1_000_000, o: 100, h: 101, l: 99, c: 100 }];
    const patched = patchSpotCandlesWithLivePrice(candles, 102, 300_000, 1_100_000);
    expect(patched).toHaveLength(1);
    expect(patched[0]).toEqual({
      t: 1_000_000,
      o: 100,
      h: 102,
      l: 99,
      c: 102,
    });
  });

  it('appends a new bar when the interval advances', () => {
    const candles = [{ t: 1_000_000, o: 100, h: 101, l: 99, c: 100 }];
    const patched = patchSpotCandlesWithLivePrice(candles, 103, 300_000, 1_300_000);
    expect(patched).toHaveLength(2);
    expect(patched[1]).toEqual({
      t: 1_300_000,
      o: 103,
      h: 103,
      l: 103,
      c: 103,
    });
  });

  it('patches all loaded timeframes', () => {
    const patch = patchMultiTfSpotCandles(
      {
        spotCandles5m: [{ t: 1_000_000, o: 1, h: 1, l: 1, c: 1 }],
        spotCandles15m: [{ t: 2_000_000, o: 2, h: 2, l: 2, c: 2 }],
        spotCandles1h: [{ t: 3_000_000, o: 3, h: 3, l: 3, c: 3 }],
      },
      50,
      3_100_000,
    );
    const last5m = patch.spotCandles5m?.[patch.spotCandles5m.length - 1];
    const last15m = patch.spotCandles15m?.[patch.spotCandles15m.length - 1];
    const last1h = patch.spotCandles1h?.[patch.spotCandles1h.length - 1];
    expect(last5m?.c).toBe(50);
    expect(last15m?.c).toBe(50);
    expect(last1h?.c).toBe(50);
  });
});