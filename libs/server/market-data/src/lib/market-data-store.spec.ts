import { FyersAPI } from 'fyers-api-v3';
import {
  MarketDataStore,
  resetMarketDataStoreForTests,
} from './market-data-store';

function okHistory(candles: FyersAPI.Candle[] = []): FyersAPI.HistoryResponse {
  return { s: 'ok', code: 200, message: '', candles };
}

describe('MarketDataStore', () => {
  beforeEach(() => {
    resetMarketDataStoreForTests();
  });

  it('reuses live history within TTL', async () => {
    const store = new MarketDataStore();
    const nowMs = 1_700_000_000_000;
    const fetch = jest
      .fn()
      .mockResolvedValue(okHistory([[nowMs / 1000, 1, 2, 0.5, 1.5, 100]]));

    const params: FyersAPI.HistoryQueryRequest = {
      symbol: 'NSE:NIFTY50-INDEX',
      resolution: '5',
      range_from: '1699000000',
      range_to: String(Math.floor(nowMs / 1000)),
      cont_flag: 1,
      oi_flag: 0,
      date_format: 0,
    };

    await store.getHistory(params, fetch, nowMs);
    await store.getHistory(params, fetch, nowMs + 15_000);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.getStats().historyHits).toBe(1);
  });

  it('refetches history after TTL expires', async () => {
    const store = new MarketDataStore();
    const nowMs = 1_700_000_000_000;
    const fetch = jest.fn().mockResolvedValue(okHistory());

    const params: FyersAPI.HistoryQueryRequest = {
      symbol: 'NSE:NIFTY50-INDEX',
      resolution: '5',
      range_from: '1699000000',
      range_to: String(Math.floor(nowMs / 1000)),
      cont_flag: 1,
      oi_flag: 0,
      date_format: 0,
    };

    await store.getHistory(params, fetch, nowMs);
    await store.getHistory(params, fetch, nowMs + 31_000);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent live history fetches', async () => {
    const store = new MarketDataStore();
    const nowMs = 1_700_000_000_000;
    let resolveFetch: (value: FyersAPI.HistoryResponse) => void = () => undefined;
    const fetch = jest.fn(
      () =>
        new Promise<FyersAPI.HistoryResponse>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const params: FyersAPI.HistoryQueryRequest = {
      symbol: 'NSE:NIFTY50-INDEX',
      resolution: '5',
      range_from: '1699000000',
      range_to: String(Math.floor(nowMs / 1000)),
      cont_flag: 1,
      oi_flag: 0,
      date_format: 0,
    };

    const first = store.getHistory(params, fetch, nowMs);
    const second = store.getHistory(params, fetch, nowMs);
    resolveFetch(okHistory([[nowMs / 1000, 1, 2, 0.5, 1.5, 100]]));

    await Promise.all([first, second]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.getStats().historyMisses).toBe(1);
  });

  it('does not share cache between historical and live queries', async () => {
    const store = new MarketDataStore();
    const nowMs = 1_700_000_000_000;
    const fetch = jest.fn().mockResolvedValue(okHistory());

    const live: FyersAPI.HistoryQueryRequest = {
      symbol: 'NSE:NIFTY50-INDEX',
      resolution: '15',
      range_from: '1699000000',
      range_to: String(Math.floor(nowMs / 1000)),
      cont_flag: 1,
      oi_flag: 0,
      date_format: 0,
    };
    const historical: FyersAPI.HistoryQueryRequest = {
      ...live,
      range_to: String(Math.floor((nowMs - 24 * 60 * 60 * 1000) / 1000)),
    };

    await store.getHistory(live, fetch, nowMs);
    await store.getHistory(historical, fetch, nowMs);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

});