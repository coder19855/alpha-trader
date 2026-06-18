import { computeSimMomentumDecayPercent } from './sim-momentum-decay';

describe('sim-momentum-decay', () => {
  it('returns elevated decay when recent candles oppose CE-BUY', () => {
    const candles = [
      [1, 104, 104.5, 103.5, 103.6, 0],
      [2, 103.6, 103.8, 103, 103.1, 0],
      [3, 103.1, 103.2, 102.5, 102.6, 0],
    ] as never;
    expect(computeSimMomentumDecayPercent(candles, 2, 'CE-BUY')).toBeGreaterThanOrEqual(
      25,
    );
  });
});