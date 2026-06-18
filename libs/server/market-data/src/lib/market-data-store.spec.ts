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
    await store.getHistory(params, fetch, nowMs + 30_000);

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
    await store.getHistory(params, fetch, nowMs + 61_000);

    expect(fetch).toHaveBeenCalledTimes(2);
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