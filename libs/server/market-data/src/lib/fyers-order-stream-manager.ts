import { FastifyBaseLogger } from 'fastify';
import { FYERS_ORDER_STREAM_DEFAULTS } from '@alpha-trader/server-shared';
import {
  applyWsPositionUpdate,
  setOpenPositionsWsLive,
} from './open-positions-live-cache.js';
import {
  createFyersOrderSocket,
  FyersWsPositionsMessage,
  OrderSocketLike,
} from './fyers-order-socket-adapter.js';

export interface OrderStreamStats {
  enabled: boolean;
  connected: boolean;
  messages: number;
  positionUpdates: number;
  tradeUpdates: number;
  orderUpdates: number;
  lastMessageAt: string | null;
  lastError: string | null;
  lastBootstrapAt: string | null;
}

export interface OrderStreamPositionChange {
  indexSymbols: string[];
  optionSymbols: string[];
}

export class FyersOrderStreamManager {
  private socket: OrderSocketLike | null = null;
  private connected = false;
  private messages = 0;
  private positionUpdates = 0;
  private tradeUpdates = 0;
  private orderUpdates = 0;
  private lastMessageAt: number | null = null;
  private lastError: string | null = null;
  private lastBootstrapAt: number | null = null;
  private accessTokenKey = '';
  private bootstrapInFlight: Promise<void> | null = null;

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly onPositionChange?: (
      change: OrderStreamPositionChange,
    ) => void,
    private readonly bootstrapPositions?: () => Promise<void>,
    private readonly createSocket: typeof createFyersOrderSocket = createFyersOrderSocket,
  ) {}

  async connect(accessToken: string, appId: string): Promise<void> {
    const tokenKey = `${appId}:${accessToken.slice(0, 12)}`;
    if (this.socket && this.connected && this.accessTokenKey === tokenKey) {
      return;
    }

    await this.disconnect();

    this.accessTokenKey = tokenKey;
    const auth = `${appId}:${accessToken}`;
    const socket = this.createSocket(auth, '', false);
    this.socket = socket;

    socket.autoreconnect(FYERS_ORDER_STREAM_DEFAULTS.AUTO_RECONNECT_TRIES);

    socket.on('connect', () => {
      this.connected = true;
      this.lastError = null;
      setOpenPositionsWsLive(true);
      this.log.info('Fyers order WebSocket connected');
      socket.subscribe([
        socket.orderUpdates,
        socket.tradeUpdates,
        socket.positionUpdates,
      ]);
      void this.runBootstrap('connect');
    });

    socket.on('positions', (message: unknown) => {
      this.recordMessage();
      this.positionUpdates += 1;
      this.handlePositionsMessage(message);
    });

    socket.on('trades', () => {
      this.recordMessage();
      this.tradeUpdates += 1;
    });

    socket.on('orders', () => {
      this.recordMessage();
      this.orderUpdates += 1;
    });

    socket.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.log.warn({ err }, 'Fyers order WebSocket error');
    });

    socket.on('close', () => {
      this.connected = false;
      setOpenPositionsWsLive(false);
      this.log.info('Fyers order WebSocket closed');
    });

    socket.connect();
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore close errors during teardown
      }
    }
    this.socket = null;
    this.connected = false;
    setOpenPositionsWsLive(false);
    this.accessTokenKey = '';
    this.bootstrapInFlight = null;
  }

  isConnected(): boolean {
    return this.connected || Boolean(this.socket?.isConnected?.());
  }

  getStats(enabled: boolean): OrderStreamStats {
    return {
      enabled,
      connected: this.isConnected(),
      messages: this.messages,
      positionUpdates: this.positionUpdates,
      tradeUpdates: this.tradeUpdates,
      orderUpdates: this.orderUpdates,
      lastMessageAt: this.lastMessageAt
        ? new Date(this.lastMessageAt).toISOString()
        : null,
      lastError: this.lastError,
      lastBootstrapAt: this.lastBootstrapAt
        ? new Date(this.lastBootstrapAt).toISOString()
        : null,
    };
  }

  private recordMessage(): void {
    this.messages += 1;
    this.lastMessageAt = Date.now();
  }

  private handlePositionsMessage(message: unknown): void {
    const payload = message as FyersWsPositionsMessage;
    const row = payload?.positions;
    if (!row?.symbol) return;

    const change = applyWsPositionUpdate(row);
    if (!change) return;

    this.onPositionChange?.({
      indexSymbols: [change.indexSymbol],
      optionSymbols: [change.symbol],
    });
  }

  private async runBootstrap(reason: string): Promise<void> {
    if (!this.bootstrapPositions) return;
    if (this.bootstrapInFlight) {
      await this.bootstrapInFlight;
      return;
    }

    const promise = this.bootstrapPositions()
      .then(() => {
        this.lastBootstrapAt = Date.now();
        this.log.debug({ reason }, 'Open positions REST bootstrap complete');
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = message;
        this.log.warn({ err, reason }, 'Open positions REST bootstrap failed');
      })
      .finally(() => {
        if (this.bootstrapInFlight === promise) {
          this.bootstrapInFlight = null;
        }
      });

    this.bootstrapInFlight = promise;
    await promise;
  }
}