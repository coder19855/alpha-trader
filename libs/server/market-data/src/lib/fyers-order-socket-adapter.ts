export interface FyersWsPositionRow {
  symbol?: string;
  netQty?: number;
  qty?: number;
  buyAvg?: number;
  unrealized_profit?: number;
  pl?: number;
}

export interface FyersWsPositionsMessage {
  s?: string;
  positions?: FyersWsPositionRow;
}

export interface OrderSocketLike {
  orderUpdates: string;
  tradeUpdates: string;
  positionUpdates: string;
  on(
    event: 'connect' | 'close' | 'error' | 'orders' | 'trades' | 'positions' | 'general',
    callback: (...args: unknown[]) => void,
  ): void;
  subscribe(topics: string | string[]): void;
  connect(): void;
  close(): void;
  isConnected(): boolean;
  autoreconnect(tries?: number): void;
}

export function createFyersOrderSocket(
  accessToken: string,
  logPath = '',
  logEnabled = false,
): OrderSocketLike {
  const { fyersOrderSocket } = require('fyers-api-v3') as {
    fyersOrderSocket: new (
      token: string,
      logPath: string,
      logEnabled: boolean,
    ) => OrderSocketLike;
  };

  return new fyersOrderSocket(accessToken, logPath, logEnabled);
}