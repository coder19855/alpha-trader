import 'fastify';
import type { OpenPositionsStreamHub } from './lib/open-positions-stream-hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    openPositionsStreamHub: OpenPositionsStreamHub;
    fyersMarketStream?: {
      getIndexLtp: (symbol: string) => number | null;
      getOptionLtp: (symbol: string) => number | null;
    };
    fyers: import('fyers-api-v3').fyersModel;
    ensureFyersSession?: (options?: {
      verifyWithApi?: boolean;
    }) => Promise<boolean>;
  }
}

export {};