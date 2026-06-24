import { syncTradeJournalFromPositions } from './trade-journal';

function mockFastify(rows: Array<Record<string, unknown>>) {
  const store = [...rows];
  const col = {
    find: (filter: Record<string, unknown>) => ({
      project: () => ({
        toArray: async () =>
          store.filter((row) =>
            Object.entries(filter).every(([k, v]) => row[k] === v),
          ),
      }),
    }),
    updateOne: async (
      filter: Record<string, unknown>,
      update: {
        $setOnInsert?: Record<string, unknown>;
        $set?: Record<string, unknown>;
      },
      opts?: { upsert?: boolean },
    ) => {
      const idx = store.findIndex((row) =>
        Object.entries(filter).every(([k, v]) => row[k] === v),
      );
      if (idx >= 0) {
        if (update.$set) Object.assign(store[idx], update.$set);
        return { matchedCount: 1 };
      }
      if (opts?.upsert) {
        store.push({ ...filter, ...update.$setOnInsert, ...update.$set });
        return { matchedCount: 0, upsertedCount: 1 };
      }
      return { matchedCount: 0 };
    },
  };
  return {
    mongo: { db: { collection: () => col } },
    log: { warn: jest.fn() },
  };
}

describe('syncTradeJournalFromPositions', () => {
  it('records open when a new Fyers leg appears', async () => {
    const fastify = mockFastify([]);
    await syncTradeJournalFromPositions(fastify as never, {
      symbol: 'NSE:NIFTY50-INDEX',
      tradingStyle: 'INTRADAY',
      entries: [
        {
          symbol: 'NSE:NIFTY25JUN24500CE',
          direction: 'CE-BUY',
          indexLabel: 'NIFTY',
        },
      ],
      paTrigger: 'CE-BUY — test',
    });
    const col = fastify.mongo.db.collection();
    const open = await col
      .find({ symbol: 'NSE:NIFTY50-INDEX', status: 'open' })
      .project({})
      .toArray();
    expect(open).toHaveLength(1);
    expect(open[0].positionId).toBe('NSE:NIFTY25JUN24500CE');
  });

  it('closes journal rows that disappear from Fyers without in-memory state', async () => {
    const fastify = mockFastify([
      {
        id: 'NSE:NIFTY50-INDEX|NSE:NIFTY25JUN24500CE',
        symbol: 'NSE:NIFTY50-INDEX',
        tradingStyle: 'INTRADAY',
        positionId: 'NSE:NIFTY25JUN24500CE',
        status: 'open',
        side: 'CE',
        entryAt: '2026-06-24T09:00:00.000Z',
      },
    ]);
    await syncTradeJournalFromPositions(fastify as never, {
      symbol: 'NSE:NIFTY50-INDEX',
      tradingStyle: 'INTRADAY',
      entries: [],
    });
    const col = fastify.mongo.db.collection();
    const closed = await col
      .find({ symbol: 'NSE:NIFTY50-INDEX', status: 'closed' })
      .project({})
      .toArray();
    expect(closed).toHaveLength(1);
    expect(closed[0].exitAt).toBeTruthy();
  });
});