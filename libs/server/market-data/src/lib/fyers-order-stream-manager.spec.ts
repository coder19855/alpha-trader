import { FastifyBaseLogger } from 'fastify';
import {
  clearOpenPositionsCache,
  getOpenPositionsCacheSnapshot,
  isOpenPositionsWsLive,
} from './open-positions-live-cache';
import { FyersOrderStreamManager } from './fyers-order-stream-manager';
import { OrderSocketLike } from './fyers-order-socket-adapter';

function createMockSocket(): OrderSocketLike & {
  handlers: Record<string, (...args: unknown[]) => void>;
  trigger: (event: string, payload?: unknown) => void;
} {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const socket = {
    orderUpdates: 'orders',
    tradeUpdates: 'trades',
    positionUpdates: 'positions',
    handlers,
    on(event: string, callback: (...args: unknown[]) => void) {
      handlers[event] = callback;
    },
    subscribe: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    autoreconnect: jest.fn(),
    trigger(event: string, payload?: unknown) {
      handlers[event]?.(payload);
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
});