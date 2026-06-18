import {
  CHANDELIER_DEFAULT_ATR_MULT,
  chandelierStopFromExtreme,
  initChandelierState,
  tighterStopPrice,
  updateChandelierState,
} from './chandelier-exit';

describe('chandelier-exit', () => {
  it('computes long stop as highest high minus ATR multiple', () => {
    expect(
      chandelierStopFromExtreme('CE-BUY', 110, 2, CHANDELIER_DEFAULT_ATR_MULT),
    ).toBe(104);
  });

  it('ratchets CE stop upward only', () => {
    let state = initChandelierState('CE-BUY', 100, 2, 3);
    state = updateChandelierState('CE-BUY', state, 108, 99, 100, 22, 3);
    const afterPullback = updateChandelierState(
      'CE-BUY',
      state,
      106,
      104,
      108,
      22,
      3,
    );
    expect(afterPullback.stopPrice).toBe(state.stopPrice);
    expect(afterPullback.stopPrice).toBeGreaterThan(100);
  });

  it('picks tighter stop for hybrid CE (higher price)', () => {
    expect(tighterStopPrice('CE-BUY', 105, 107)).toBe(107);
    expect(tighterStopPrice('PE-BUY', 95, 93)).toBe(93);
  });
});