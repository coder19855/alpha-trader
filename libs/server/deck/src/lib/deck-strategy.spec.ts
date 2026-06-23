import {
  buildOptionRecommendedStrategies,
  buildPaRecommendedStrategies,
} from './deck-strategy.js';

describe('buildOptionRecommendedStrategies', () => {
  it('is distinct from the price-action structural list for the same signal', () => {
    const pa = buildPaRecommendedStrategies('CE-BUY', 70);
    const opt = buildOptionRecommendedStrategies('CE-BUY', 70, 'Normal IV', 'Moderate Bullish');
    const paNames = pa.map((s) => s.strategy).join('|');
    const optNames = opt.map((s) => s.strategy).join('|');
    expect(optNames).not.toBe(paNames);
    expect(opt.length).toBeGreaterThan(0);
  });

  it('leads with a defined-risk spread when IV is high (theta/vega aware)', () => {
    const highIv = buildOptionRecommendedStrategies('CE-BUY', 70, 'High IV', 'Bullish');
    expect(highIv[0].strategy.toLowerCase()).toContain('spread');

    const lowIv = buildOptionRecommendedStrategies('CE-BUY', 70, 'Low IV', 'Bullish');
    expect(lowIv[0].strategy.toLowerCase()).toContain('long');
  });

  it('favors premium-selling structures when neutral with high IV', () => {
    const neutral = buildOptionRecommendedStrategies('NEUTRAL', 30, 'High IV');
    const names = neutral.map((s) => s.strategy.toLowerCase()).join('|');
    expect(names).toContain('condor');
  });

  it('produces bearish structures for PE-BUY', () => {
    const bear = buildOptionRecommendedStrategies('PE-BUY', 65, 'Normal IV', 'Bearish');
    const names = bear.map((s) => s.strategy.toLowerCase()).join('|');
    expect(names).toMatch(/put|bear/);
  });

  it('surfaces option-flow bias in the reasoning when not neutral', () => {
    const bull = buildOptionRecommendedStrategies('CE-BUY', 60, 'Normal IV', 'Strong Bullish');
    const reasons = bull.map((s) => s.reason).join(' ');
    expect(reasons).toContain('Strong Bullish');
  });
});
