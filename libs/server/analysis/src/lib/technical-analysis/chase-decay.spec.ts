import {
  applyChaseDecayToConviction,
  computeSetupOverrunR,
  evaluateChaseDecay,
} from './chase-decay';

describe('chase-decay', () => {
  it('ignores neutral and no-trade actions', () => {
    expect(evaluateChaseDecay({ action: 'NO-TRADE', primaryScore: 0.5 })).toEqual({
      extensionR: 0,
      decayPercent: 0,
      blocked: false,
      reasons: [],
    });
  });

  it('does not decay fresh setups', () => {
    const result = evaluateChaseDecay({
      action: 'CE-BUY',
      primaryScore: 0.12,
      recentMomentum: 0.1,
    });
    expect(result.decayPercent).toBe(0);
    expect(result.blocked).toBe(false);
  });

  it('blocks heavily extended CE entries', () => {
    const result = evaluateChaseDecay({
      action: 'CE-BUY',
      primaryScore: 0.68,
      recentMomentum: 0.75,
    });
    expect(result.blocked).toBe(true);
    expect(result.extensionR).toBeGreaterThanOrEqual(0.85);
  });

  it('blocks late chase when entry has overrun swing risk', () => {
    const overrun = computeSetupOverrunR('CE-BUY', {
      entry: 24_200,
      stopLoss: 24_120,
      rawStopLoss: 24_050,
    });
    expect(overrun).toBeGreaterThan(0.85);

    const result = evaluateChaseDecay({
      action: 'CE-BUY',
      primaryScore: 0.2,
      recentMomentum: 0.1,
      tradeSetup: {
        entry: 24_200,
        stopLoss: 24_120,
        rawStopLoss: 24_050,
      },
    });
    expect(result.blocked).toBe(true);
    expect(result.setupOverrunR).toBe(overrun);
  });

  it('shaves conviction on moderate chase', () => {
    const chase = evaluateChaseDecay({
      action: 'PE-BUY',
      primaryScore: -0.4,
      recentMomentum: -0.5,
    });
    expect(chase.blocked).toBe(false);
    expect(chase.decayPercent).toBeGreaterThan(0);
    expect(applyChaseDecayToConviction(95, chase)).toBeLessThan(95);
  });
});