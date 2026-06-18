import {
  applyWsPositionUpdate,
  clearOpenPositionsCache,
  getOpenPositionsCacheSnapshot,
  isOpenPositionsWsLive,
  seedOpenPositionsCache,
  setOpenPositionsWsLive,
} from './open-positions-live-cache';

describe('open-positions-live-cache', () => {
  beforeEach(() => {
    clearOpenPositionsCache();
    setOpenPositionsWsLive(false);
  });

  it('seeds and reads cached positions', () => {
    seedOpenPositionsCache(
      [
        {
          symbol: 'NSE:NIFTY24JUN25000CE',
          optionLabel: 'NIFTY24JUN25000CE',
          indexSymbol: 'NSE:NIFTY50-INDEX',
          indexLabel: 'NIFTY',
          direction: 'CE-BUY',
          netQty: 65,
          buyAvg: 120,
          unrealizedPnl: 500,
        },
      ],
      'rest',
    );

    const snapshot = getOpenPositionsCacheSnapshot();
    expect(snapshot?.positions).toHaveLength(1);
    expect(snapshot?.source).toBe('rest');
  });

  it('applies WS position updates and removals', () => {
    seedOpenPositionsCache(
      [
        {
          symbol: 'NSE:NIFTY24JUN25000CE',
          optionLabel: 'NIFTY24JUN25000CE',
          indexSymbol: 'NSE:NIFTY50-INDEX',
          indexLabel: 'NIFTY',
          direction: 'CE-BUY',
          netQty: 65,
          buyAvg: 120,
          unrealizedPnl: 500,
        },
      ],
      'rest',
    );

    const updated = applyWsPositionUpdate({
      symbol: 'NSE:NIFTY24JUN25000CE',
      netQty: 100,
      buyAvg: 125,
      unrealized_profit: 800,
    });
    expect(updated?.removed).toBe(false);
    expect(getOpenPositionsCacheSnapshot()?.positions[0].netQty).toBe(100);

    const removed = applyWsPositionUpdate({
      symbol: 'NSE:NIFTY24JUN25000CE',
      netQty: 0,
    });
    expect(removed?.removed).toBe(true);
    expect(getOpenPositionsCacheSnapshot()?.positions).toHaveLength(0);
    expect(getOpenPositionsCacheSnapshot()?.source).toBe('ws');
  });

  it('tracks ws live flag', () => {
    expect(isOpenPositionsWsLive()).toBe(false);
    setOpenPositionsWsLive(true);
    expect(isOpenPositionsWsLive()).toBe(true);
  });
});