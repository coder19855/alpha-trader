import {
  initStructureTrailState,
  resolveStructureTrailAtrBuffer,
  updateStructureTrailState,
} from './structure-trail-exit';

describe('structure-trail-exit', () => {
  it('uses 2× ATR before 1.5R peak and 1.5× after', () => {
    expect(resolveStructureTrailAtrBuffer(1.2)).toBe(2);
    expect(resolveStructureTrailAtrBuffer(1.5)).toBe(1.5);
  });

  it('ratchets CE structure stop after new highs', () => {
    let state = initStructureTrailState('CE-BUY', 100, 2);
    state = updateStructureTrailState('CE-BUY', state, 108, 99, 2);
    const afterHigh = updateStructureTrailState('CE-BUY', state, 112, 106, 2);
    expect(afterHigh.stopPrice).toBeGreaterThanOrEqual(state.stopPrice);
    expect(afterHigh.stopPrice).toBeGreaterThan(95);
  });
});