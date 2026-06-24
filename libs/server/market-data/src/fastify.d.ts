import 'fastify';
import type { fyersModel } from 'fyers-api-v3';

declare module 'fastify' {
  interface FastifyInstance {
    fyers: fyersModel;
    ensureFyersSession: (options?: {
      verifyWithApi?: boolean;
    }) => Promise<boolean>;
    marketDataCache: {
      getStats: () => {
        historyHits: number;
        historyMisses: number;
        historyEntries: number;
      };
    };
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
      getStats: () => import('./lib/fyers-market-stream-manager.js').MarketStreamStats;
      syncOptionSymbols: (indexSymbol: string, symbols: string[]) => void;
      clearOptionSymbols: (indexSymbol: string) => void;
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