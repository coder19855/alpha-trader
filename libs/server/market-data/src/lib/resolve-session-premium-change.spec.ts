import { resolveSessionPremiumChange } from './resolve-session-premium-change';

describe('resolveSessionPremiumChange', () => {
  it('prefers non-zero quote session change', () => {
    expect(
      resolveSessionPremiumChange(
        { symbol: 'X', ltp: 100, ch: 2, chp: 1.5, updatedAt: 0, source: 'rest' },
        5,
        3,
      ),
    ).toEqual({ ltpChange: 2, ltpChangePct: 1.5 });
  });

  it('falls back to chain row when quote change is zero', () => {
    expect(
      resolveSessionPremiumChange(
        { symbol: 'X', ltp: 100, ch: 0, chp: 0, updatedAt: 0, source: 'ws' },
        4.5,
        2.1,
      ),
    ).toEqual({ ltpChange: 4.5, ltpChangePct: 2.1 });
  });
});