import { normalizeAutoExitPreference } from './auto-exit-preference.js';

describe('normalizeAutoExitPreference', () => {
  it('applies defaults for empty input', () => {
    expect(normalizeAutoExitPreference(null)).toEqual({
      enabled: false,
      retestCount: 2,
      signalFlipExit: true,
      exitPolicy: 'rr-ladder',
      positionPolicy: 'flat',
      optionPremiumExit: true,
      optionPremiumStopPct: 40,
    });
  });

  it('clamps retest count and normalizes policies', () => {
    expect(
      normalizeAutoExitPreference({
        enabled: true,
        retestCount: 99,
        exitPolicy: 'chandelier',
        positionPolicy: 'scale-ladder',
      }),
    ).toMatchObject({
      enabled: true,
      retestCount: 5,
      exitPolicy: 'chandelier',
      positionPolicy: 'scale-ladder',
    });
  });
});