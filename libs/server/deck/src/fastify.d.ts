import 'fastify';
import type { fyersModel } from 'fyers-api-v3';
import type { MarketStreamStats } from '@alpha-trader/server-market-data';

declare module 'fastify' {
  interface FastifyInstance {
    fyers: fyersModel;
    ensureFyersSession: (options?: {
      verifyWithApi?: boolean;
    }) => Promise<boolean>;
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
  }
}

export {};