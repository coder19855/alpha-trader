import { FastifyBaseLogger } from 'fastify';
import {
  clearOpenPositionsCache,
  getOpenPositionsCacheSnapshot,
  isOpenPositionsWsLive,
} from './open-positions-live-cache';
import { FyersOrderStreamManager } from './fyers-order-stream-manager';
import { OrderSocketLike } from './fyers-order-socket-adapter';

function createMockSocket(): OrderSocketLike & {
  listenerCount: (event: string) => number;
  trigger: (event: string, payload?: unknown) => void;
} {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    orderUpdates: 'orders',
    tradeUpdates: 'trades',
    positionUpdates: 'positions',
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
    subscribe: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    autoreconnect: jest.fn(),
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

describe('FyersOrderStreamManager', () => {
  const log = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as FastifyBaseLogger;

  beforeEach(() => {
    clearOpenPositionsCache();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('bootstraps on connect and applies position WS updates', async () => {
    const socket = createMockSocket();
    const bootstrap = jest.fn().mockResolvedValue(undefined);
    const onPositionChange = jest.fn();

    const manager = new FyersOrderStreamManager(
      log,
      onPositionChange,
      bootstrap,
      () => socket,
    );

    await manager.connect('token-abc', 'app-id');
    socket.trigger('connect');

    expect(socket.subscribe).toHaveBeenCalledWith([
      'orders',
      'trades',
      'positions',
    ]);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(isOpenPositionsWsLive()).toBe(true);

    socket.trigger('positions', {
      s: 'ok',
      positions: {
        symbol: 'NSE:NIFTY24JUN25000CE',
        netQty: 65,
        buyAvg: 120,
        unrealized_profit: 500,
      },
    });

    expect(getOpenPositionsCacheSnapshot()?.positions).toHaveLength(1);
    expect(onPositionChange).toHaveBeenCalledWith({
      indexSymbols: ['NSE:NIFTY50-INDEX'],
      optionSymbols: ['NSE:NIFTY24JUN25000CE'],
    });
  });

  it('detaches socket handlers on disconnect', async () => {
    const socket = createMockSocket();
    const manager = new FyersOrderStreamManager(log, undefined, undefined, () => socket);

    await manager.connect('token-abc', 'app-id');

    expect(socket.listenerCount('connect')).toBe(1);
    expect(socket.listenerCount('positions')).toBe(1);
    expect(socket.listenerCount('trades')).toBe(1);
    expect(socket.listenerCount('orders')).toBe(1);
    expect(socket.listenerCount('error')).toBe(1);
    expect(socket.listenerCount('close')).toBe(1);

    await manager.disconnect();

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount('connect')).toBe(0);
    expect(socket.listenerCount('positions')).toBe(0);
    expect(socket.listenerCount('trades')).toBe(0);
    expect(socket.listenerCount('orders')).toBe(0);
    expect(socket.listenerCount('error')).toBe(0);
    expect(socket.listenerCount('close')).toBe(0);
    expect(isOpenPositionsWsLive()).toBe(false);
  });

  it('ignores stale close events after reconnect', async () => {
    const first = createMockSocket();
    const second = createMockSocket();
    const sockets = [first, second];
    const manager = new FyersOrderStreamManager(
      log,
      undefined,
      undefined,
      () => {
        const socket = sockets.shift();
        if (!socket) throw new Error('No mock socket remaining');
        return socket;
      },
    );

    await manager.connect('token-one', 'app-id');
    first.trigger('connect');

    await manager.connect('token-two', 'app-id');
    second.trigger('connect');
    first.trigger('close');

    expect(first.listenerCount('connect')).toBe(0);
    expect(first.listenerCount('positions')).toBe(0);
    expect(first.listenerCount('trades')).toBe(0);
    expect(first.listenerCount('orders')).toBe(0);
    expect(first.listenerCount('error')).toBe(0);
    expect(first.listenerCount('close')).toBe(0);
    expect(manager.isConnected()).toBe(true);
    expect(isOpenPositionsWsLive()).toBe(true);
  });

  it('runs periodic reconciliation bootstrap after connect and clears on disconnect', async () => {
    const socket = createMockSocket();
    const bootstrap = jest.fn().mockResolvedValue(undefined);

    const manager = new FyersOrderStreamManager(
      log,
      undefined,
      bootstrap,
      () => socket,
    );

    await manager.connect('token-abc', 'app-id');
    socket.trigger('connect');

    // Flush the bootstrap promise chain (then/catch/finally = multiple microtask ticks)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // bootstrap called once on connect
    expect(bootstrap).toHaveBeenCalledTimes(1);

    // Advance well past REST_RECONCILE_MS (300s max + 60s jitter) to trigger periodic reconcile
    jest.advanceTimersByTime(400_000);
    // Flush promise chain for periodic bootstrap
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // bootstrap should be called again by the periodic timer
    expect(bootstrap.mock.calls.length).toBeGreaterThanOrEqual(2);

    await manager.disconnect();

    const callsAfterDisconnect = bootstrap.mock.calls.length;
    jest.advanceTimersByTime(600_000);
    await Promise.resolve();
    await Promise.resolve();

    // No additional calls after disconnect
    expect(bootstrap.mock.calls.length).toBe(callsAfterDisconnect);
  });
});