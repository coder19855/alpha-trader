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
import {
  detachSocketHandler,
  SocketEventHandler,
} from './socket-listener-cleanup.js';

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
  private socketHandlers:
    | {
        socket: OrderSocketLike;
        connect: SocketEventHandler;
        positions: SocketEventHandler;
        trades: SocketEventHandler;
        orders: SocketEventHandler;
        error: SocketEventHandler;
        close: SocketEventHandler;
      }
    | null = null;
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
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.attachSocketHandlers(socket);

    socket.connect();
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    setOpenPositionsWsLive(false);
    this.accessTokenKey = '';
    this.bootstrapInFlight = null;
    this.stopPeriodicReconcile();
    if (socket) {
      this.detachSocketHandlers(socket);
      try {
        socket.close();
      } catch {
        // ignore close errors during teardown
      }
    }
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

  private startPeriodicReconcile(): void {
    this.stopPeriodicReconcile();
    const schedule = () => {
      const base = FYERS_ORDER_STREAM_DEFAULTS.REST_RECONCILE_MS;
      const jitter = Math.round(base * 0.2);
      const delay = base + Math.round(Math.random() * jitter * 2 - jitter);
      this.reconcileTimer = setTimeout(() => {
        if (this.socket && this.connected) {
          void this.runBootstrap('periodic');
        }
        schedule();
      }, delay);
      this.reconcileTimer?.unref?.();
    };
    schedule();
  }

  private stopPeriodicReconcile(): void {
    if (this.reconcileTimer !== null) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  private attachSocketHandlers(socket: OrderSocketLike): void {
    const onConnect = () => {
      if (this.socket !== socket) return;
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
      this.startPeriodicReconcile();
    };

    const onPositions = (message: unknown) => {
      if (this.socket !== socket) return;
      this.recordMessage();
      this.positionUpdates += 1;
      this.handlePositionsMessage(message);
    };

    const onTrades = () => {
      if (this.socket !== socket) return;
      this.recordMessage();
      this.tradeUpdates += 1;
    };

    const onOrders = () => {
      if (this.socket !== socket) return;
      this.recordMessage();
      this.orderUpdates += 1;
    };

    const onError = (err: unknown) => {
      if (this.socket !== socket) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.log.warn({ err }, 'Fyers order WebSocket error');
    };

    const onClose = () => {
      if (this.socket !== socket) return;
      this.connected = false;
      setOpenPositionsWsLive(false);
      this.stopPeriodicReconcile();
      this.log.info('Fyers order WebSocket closed');
    };

    socket.on('connect', onConnect);
    socket.on('positions', onPositions);
    socket.on('trades', onTrades);
    socket.on('orders', onOrders);
    socket.on('error', onError);
    socket.on('close', onClose);
    this.socketHandlers = {
      socket,
      connect: onConnect,
      positions: onPositions,
      trades: onTrades,
      orders: onOrders,
      error: onError,
      close: onClose,
    };
  }

  private detachSocketHandlers(socket: OrderSocketLike): void {
    if (this.socketHandlers?.socket !== socket) return;
    detachSocketHandler(socket, 'connect', this.socketHandlers.connect);
    detachSocketHandler(socket, 'positions', this.socketHandlers.positions);
    detachSocketHandler(socket, 'trades', this.socketHandlers.trades);
    detachSocketHandler(socket, 'orders', this.socketHandlers.orders);
    detachSocketHandler(socket, 'error', this.socketHandlers.error);
    detachSocketHandler(socket, 'close', this.socketHandlers.close);
    this.socketHandlers = null;
  }
}