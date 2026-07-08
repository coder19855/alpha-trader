import { FastifyBaseLogger } from 'fastify';
import { FyersMarketStreamManager } from './fyers-market-stream-manager';
import { DataSocketLike } from './fyers-data-socket-adapter';
import { getQuoteCache, resetQuoteCacheForTests } from './quote-cache';
import { onQuoteTicksUpdated } from './market-stream-coordinator';

function createMockSocket(): DataSocketLike & {
  trigger: (event: string, payload?: unknown) => void;
  listenerCount: (event: string) => number;
} {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    on(event: string, callback: (...args: unknown[]) => void) {
      const listeners = handlers.get(event) ?? new Set<(...args: unknown[]) => void>();
      listeners.add(callback);
      handlers.set(event, listeners);
    },
    off(event: string, callback: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(callback);
    },
    removeListener(event: string, callback: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(callback);
    },
    removeAllListeners(event?: string) {
      if (event) {
        handlers.delete(event);
        return;
      }
      handlers.clear();
    },
    connect: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    mode: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    autoReconnect: jest.fn(),
    LiteMode: 'lite',
    trigger(event: string, payload?: unknown) {
      for (const callback of [...(handlers.get(event) ?? [])]) {
        callback(payload);
      }
    },
    listenerCount(event: string) {
      return handlers.get(event)?.size ?? 0;
    },
  };
  return socket;
}

describe('FyersMarketStreamManager', () => {
  const log = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as FastifyBaseLogger;

  beforeEach(() => {
    resetQuoteCacheForTests();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('detaches socket handlers on disconnect', async () => {
    const socket = createMockSocket();
    const manager = new FyersMarketStreamManager(log, () => socket);

    await manager.connect('token-abc', 'app-id');

    expect(socket.listenerCount('connect')).toBe(1);
    expect(socket.listenerCount('message')).toBe(1);
    expect(socket.listenerCount('error')).toBe(1);
    expect(socket.listenerCount('close')).toBe(1);

    await manager.disconnect();

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount('connect')).toBe(0);
    expect(socket.listenerCount('message')).toBe(0);
    expect(socket.listenerCount('error')).toBe(0);
    expect(socket.listenerCount('close')).toBe(0);
    expect(manager.isConnected()).toBe(false);
  });

  it('ignores stale socket events after reconnect', async () => {
    const first = createMockSocket();
    const second = createMockSocket();
    const sockets = [first, second];
    const manager = new FyersMarketStreamManager(log, () => {
      const socket = sockets.shift();
      if (!socket) throw new Error('No mock socket remaining');
      return socket;
    });

    manager.addWatchIndexSymbols(['NSE:NIFTY50-INDEX']);
    await manager.connect('token-one', 'app-id');
    first.trigger('connect');

    await manager.connect('token-two', 'app-id');
    second.trigger('connect');
    first.trigger('close');
    first.trigger('error', new Error('stale'));
    first.trigger('message', {
      d: [{ n: 'NSE:NIFTY50-INDEX', v: { lp: 25000, ch: 0, chp: 0 } }],
    });

    expect(first.listenerCount('connect')).toBe(0);
    expect(first.listenerCount('message')).toBe(0);
    expect(first.listenerCount('error')).toBe(0);
    expect(first.listenerCount('close')).toBe(0);
    expect(manager.isConnected()).toBe(true);
    expect(manager.getStats(true).messages).toBe(0);
    expect(second.subscribe).toHaveBeenCalled();
  });

  it('coalesces multiple tick messages into a single listener notification', async () => {
    const socket = createMockSocket();
    const manager = new FyersMarketStreamManager(log, () => socket);
    await manager.connect('token-abc', 'app-id');
    socket.trigger('connect');

    const seen: string[][] = [];
    const unsub = onQuoteTicksUpdated((symbols) => seen.push(symbols));

    // Fire three messages rapidly using the symbol-keyed map format
    socket.trigger('message', { 'NSE:NIFTY50-INDEX': { ltp: 25000, ch: 0, chp: 0 } });
    socket.trigger('message', { 'NSE:NIFTY50-INDEX': { ltp: 25001, ch: 0, chp: 0 } });
    socket.trigger('message', { 'NSE:BANKNIFTY-INDEX': { ltp: 51000, ch: 0, chp: 0 } });

    // Before flush: listener should NOT have fired yet
    expect(seen).toHaveLength(0);

    // Advance timers past TICK_COALESCE_MS (200ms)
    jest.advanceTimersByTime(300);

    // After flush: exactly one batch notification
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('NSE:NIFTY50-INDEX');
    expect(seen[0]).toContain('NSE:BANKNIFTY-INDEX');

    unsub();
    await manager.disconnect();
  });

  it('evicts quote cache entries for unsubscribed symbols', async () => {
    const socket = createMockSocket();
    const manager = new FyersMarketStreamManager(log, () => socket);

    manager.addWatchIndexSymbols(['NSE:NIFTY50-INDEX']);
    manager.syncOpenOutcomeSymbols(['NSE:NIFTY24JUN25000CE']);
    await manager.connect('token-abc', 'app-id');
    socket.trigger('connect');

    // Seed quote cache with the option symbol
    getQuoteCache().upsert({
      symbol: 'NSE:NIFTY24JUN25000CE',
      ltp: 200,
      ch: 0,
      chp: 0,
      source: 'ws',
    });
    expect(getQuoteCache().get('NSE:NIFTY24JUN25000CE')).not.toBeNull();

    // Remove the position symbol — triggers reconcileSubscriptions which should
    // unsubscribe and evict from quote cache
    manager.syncOpenOutcomeSymbols([]);

    expect(socket.unsubscribe).toHaveBeenCalledWith(
      expect.arrayContaining(['NSE:NIFTY24JUN25000CE']),
    );
    expect(getQuoteCache().get('NSE:NIFTY24JUN25000CE')).toBeNull();

    await manager.disconnect();
  });

  it('getStats includes memoryUsage fields', async () => {
    const socket = createMockSocket();
    const manager = new FyersMarketStreamManager(log, () => socket);
    await manager.connect('token-abc', 'app-id');

    const stats = manager.getStats(true);
    expect(stats.memoryUsage).toBeDefined();
    expect(typeof stats.memoryUsage.rss).toBe('number');
    expect(typeof stats.memoryUsage.heapUsed).toBe('number');
    expect(typeof stats.memoryUsage.external).toBe('number');

    await manager.disconnect();
  });
});
