import {
  evaluateOptionPremiumStop,
  type AutoExitOptionLegTelemetry,
} from './option-premium-exit.js';

function leg(
  overrides: Partial<AutoExitOptionLegTelemetry> & Pick<AutoExitOptionLegTelemetry, 'buyAvg' | 'ltp'>,
): AutoExitOptionLegTelemetry {
  return {
    symbol: 'NSE:NIFTY25JUN25000CE',
    optionLabel: '25000 CE',
    pnlPct: null,
    pnlInr: null,
    delta: null,
    theta: null,
    iv: null,
    ...overrides,
  };
}

describe('evaluateOptionPremiumStop', () => {
  it('returns null when premium loss is within threshold', () => {
    expect(
      evaluateOptionPremiumStop(
        [leg({ buyAvg: 100, ltp: 70, pnlPct: -30 })],
        40,
      ),
    ).toBeNull();
  });

  it('fires when any leg breaches the configured loss percent', () => {
    const signal = evaluateOptionPremiumStop(
      [leg({ buyAvg: 100, ltp: 55, pnlPct: -45, optionLabel: '25000 CE' })],
      40,
    );
    expect(signal?.hitLevel).toBe('OPTION_PREMIUM_STOP');
    expect(signal?.immediate).toBe(true);
    expect(signal?.reason).toContain('25000 CE');
  });

  it('picks the worst leg when multiple legs breach', () => {
    const signal = evaluateOptionPremiumStop(
      [
        leg({ buyAvg: 100, ltp: 50, pnlPct: -50, optionLabel: 'A' }),
        leg({ buyAvg: 80, ltp: 30, pnlPct: -62.5, optionLabel: 'B' }),
      ],
      40,
    );
    expect(signal?.reason).toContain('B');
  });
});