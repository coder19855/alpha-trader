import { fyersDataSocket } from 'fyers-api-v3';
import { ListenerCleanupCapable } from './socket-listener-cleanup.js';

export interface DataSocketLike extends ListenerCleanupCapable {
  on(event: string, cb: (...args: unknown[]) => void): void;
  connect(): void;
  subscribe(symbols: string[], depth?: boolean): void;
  unsubscribe(symbols: string[]): void;
  mode(mode: unknown): void;
  autoReconnect?(tries: number): void;
  autoreconnect?(tries: number): void;
  close?(): void;
  isConnected?(): boolean;
  LiteMode?: unknown;
  FullMode?: unknown;
}

export function createFyersDataSocket(
  accessToken: string,
  logPath = '',
  logEnabled = false,
): DataSocketLike {
  return fyersDataSocket.getInstance(accessToken, logPath, logEnabled);
}