import { buildDeckGauges } from './deck-gauge.js';

describe('buildDeckGauges', () => {
  it('builds PA-only gauges with zero option lane', () => {
    const gauges = buildDeckGauges({
      action: 'CE-BUY',
      optionConviction: 0,
      optionBias: 'neutral',
      priceConviction: 72,
      primaryScore: 0.45,
    });

    expect(gauges.option.percent).toBe(0);
    expect(gauges.priceAction.percent).toBe(72);
    expect(gauges.priceAction.label).toBe('CE');
  });
});