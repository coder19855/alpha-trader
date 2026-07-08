import { getQuoteCache, QuoteCache, resetQuoteCacheForTests } from './quote-cache';

describe('QuoteCache', () => {
  beforeEach(() => {
    resetQuoteCacheForTests();
  });

  it('stores and returns fresh LTP', () => {
    const cache = getQuoteCache();
    cache.upsert({
      symbol: 'NSE:NIFTY50-INDEX',
      ltp: 25010,
      ch: 10,
      chp: 0.04,
      source: 'ws',
    });

    expect(cache.getLtp('NSE:NIFTY50-INDEX')).toBe(25010);
  });

  it('builds index spot ring from websocket ticks', () => {
    const cache = getQuoteCache();
    const now = 1_700_000_000_000;
    cache.upsert(
      {
        symbol: 'NSE:NIFTY50-INDEX',
        ltp: 25000,
        ch: 0,
        chp: 0,
        source: 'ws',
      },
      now,
    );
    cache.upsert(
      {
        symbol: 'NSE:NIFTY50-INDEX',
        ltp: 25005,
        ch: 5,
        chp: 0.02,
        source: 'ws',
      },
      now + 2000,
    );

    const ring = cache.getSpotRing('NSE:NIFTY50-INDEX', 60_000, now + 2000);
    expect(ring.length).toBeGreaterThanOrEqual(1);
    expect(ring[ring.length - 1].v).toBe(25005);
  });

  it('recomputes day change from prev close on LTP-only websocket ticks', () => {
    const cache = getQuoteCache();
    cache.upsert({
      symbol: 'NSE:NIFTY50-INDEX',
      ltp: 25_000,
      ch: 100,
      chp: 0.4,
      prevClose: 24_900,
      source: 'rest',
    });

    cache.upsert({
      symbol: 'NSE:NIFTY50-INDEX',
      ltp: 25_050,
      ch: 0,
      chp: 0,
      source: 'ws',
    });

    const quote = cache.get('NSE:NIFTY50-INDEX');
    expect(quote?.ch).toBe(150);
    expect(quote?.chp).toBeCloseTo(0.6, 2);
  });

  it('evictSymbol removes quote and ring data', () => {
    const cache = getQuoteCache();
    const now = 1_700_000_000_000;
    cache.upsert(
      { symbol: 'NSE:NIFTY50-INDEX', ltp: 25000, ch: 0, chp: 0, source: 'ws' },
      now,
    );
    expect(cache.get('NSE:NIFTY50-INDEX')).not.toBeNull();
    expect(cache.getSpotRing('NSE:NIFTY50-INDEX', 60_000, now).length).toBeGreaterThan(0);

    cache.evictSymbol('NSE:NIFTY50-INDEX');

    expect(cache.get('NSE:NIFTY50-INDEX')).toBeNull();
    expect(cache.getSpotRing('NSE:NIFTY50-INDEX', 60_000, now)).toHaveLength(0);
  });

  it('pruneToActiveSymbols removes inactive symbols and returns eviction count', () => {
    const cache = getQuoteCache();
    cache.upsert({ symbol: 'NSE:NIFTY50-INDEX', ltp: 25000, ch: 0, chp: 0, source: 'ws' });
    cache.upsert({ symbol: 'NSE:BANKNIFTY-INDEX', ltp: 51000, ch: 0, chp: 0, source: 'ws' });
    cache.upsert({ symbol: 'NSE:SOMEOPTION', ltp: 200, ch: 0, chp: 0, source: 'ws' });

    const active = new Set(['NSE:NIFTY50-INDEX']);
    const evicted = cache.pruneToActiveSymbols(active);

    expect(evicted).toBe(2);
    expect(cache.get('NSE:NIFTY50-INDEX')).not.toBeNull();
    expect(cache.get('NSE:BANKNIFTY-INDEX')).toBeNull();
    expect(cache.get('NSE:SOMEOPTION')).toBeNull();
  });

  it('enforces MAX_QUOTE_SYMBOLS cap and evicts oldest entry', () => {
    const cap = 3;
    const cache = new QuoteCache(cap);

    cache.upsert({ symbol: 'SYM:A', ltp: 1, ch: 0, chp: 0, source: 'ws' });
    cache.upsert({ symbol: 'SYM:B', ltp: 2, ch: 0, chp: 0, source: 'ws' });
    cache.upsert({ symbol: 'SYM:C', ltp: 3, ch: 0, chp: 0, source: 'ws' });
    // Adding a 4th symbol should evict the oldest (SYM:A)
    cache.upsert({ symbol: 'SYM:D', ltp: 4, ch: 0, chp: 0, source: 'ws' });

    expect(cache.getStats().quoteCount).toBe(cap);
    expect(cache.get('SYM:A')).toBeNull();
    expect(cache.get('SYM:D')).not.toBeNull();
  });

  it('getStats includes totalRingPoints', () => {
    const cache = getQuoteCache();
    const now = 1_700_000_000_000;
    // Two separate ticks (> 1s apart) → 2 ring points
    cache.upsert(
      { symbol: 'NSE:NIFTY50-INDEX', ltp: 25000, ch: 0, chp: 0, source: 'ws' },
      now,
    );
    cache.upsert(
      { symbol: 'NSE:NIFTY50-INDEX', ltp: 25005, ch: 0, chp: 0, source: 'ws' },
      now + 2000,
    );

    const stats = cache.getStats();
    expect(stats.totalRingPoints).toBeGreaterThanOrEqual(1);
    expect(stats.ringSymbols).toBe(1);
  });
});