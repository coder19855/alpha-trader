import { FastifyBaseLogger } from 'fastify';
import { FyersMarketStreamManager } from './fyers-market-stream-manager';
import { DataSocketLike } from './fyers-data-socket-adapter';
import { resetQuoteCacheForTests } from './quote-cache';

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
});
