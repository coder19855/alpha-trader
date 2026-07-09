import { DeckStreamHub } from './deck-stream-hub';

jest.mock('@alpha-trader/server-market-data', () => ({
  seedIndexQuotesFromRest: jest.fn().mockResolvedValue(undefined),
  getOpenPositionsCacheSnapshot: jest.fn(() => ({ positions: [] })),
}));

jest.mock('./deck-service', () => ({
  buildDeckLiveStreamTick: jest.fn().mockResolvedValue({
    action: 'neutral',
    openPositions: null,
    lastPrice: 100,
  }),
  buildDeckPositionsLtpPatch: jest.fn().mockResolvedValue({
    type: 'ltp',
    lastPrice: 100,
    openPositions: { entries: [], asOf: new Date().toISOString(), note: null },
  }),
  buildDeckPositionsUpdate: jest.fn().mockResolvedValue({
    type: 'positions',
    openPositions: { entries: [], asOf: new Date().toISOString(), note: null },
  }),
}));

describe('DeckStreamHub', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('cleans up idle channels after closed subscribers are pruned by heartbeat', () => {
    const hub = new DeckStreamHub(
      {
        optionChainStreamHub: { setPaAction: jest.fn() },
      } as never,
      { warn: jest.fn() } as never,
    );

    hub.subscribe(
      { symbol: 'NSE:NIFTY50-INDEX', tradingStyle: 'INTRADAY' },
      {
        id: 'closed-subscriber',
        write: jest.fn(),
        writeHeartbeat: jest.fn(),
        isClosed: () => true,
      },
    );

    expect(
      hub.getSubscriberCount({
        symbol: 'NSE:NIFTY50-INDEX',
        tradingStyle: 'INTRADAY',
      }),
    ).toBe(1);

    jest.advanceTimersByTime(15_000);

    expect(
      hub.getSubscriberCount({
        symbol: 'NSE:NIFTY50-INDEX',
        tradingStyle: 'INTRADAY',
      }),
    ).toBe(0);
    expect((hub as any).channels.size).toBe(0);
  });
});
