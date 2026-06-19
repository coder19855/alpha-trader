import 'fastify';
import type { MarketStreamStats } from '@alpha-trader/server-market-data';
import type { OpenPositionsStreamHub } from './lib/open-positions-stream-hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    openPositionsStreamHub: OpenPositionsStreamHub;
    fyersMarketStream?: {
      isEnabled: () => boolean;
      isConnected: () => boolean;
      getIndexLtp: (symbol: string) => number | null;
      getOptionLtp: (symbol: string) => number | null;
      getSpotSeries: (
        symbol: string,
        maxAgeMs?: number,
      ) => Array<{ t: number; v: number }>;
      getQuote: (symbol: string) => unknown;
      getStats: () => MarketStreamStats;
      syncSession: () => Promise<void>;
    };
    fyersOrderStream?: {
      isEnabled: () => boolean;
      isConnected: () => boolean;
      getStats: () => Record<string, unknown>;
      syncSession: () => Promise<void>;
    };
    fyers: import('fyers-api-v3').fyersModel;
    ensureFyersSession?: (options?: {
      verifyWithApi?: boolean;
    }) => Promise<boolean>;
  }
}

export {};