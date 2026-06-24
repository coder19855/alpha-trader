import 'fastify';
import type { Db, MongoClient, ObjectId } from 'mongodb';
import type { fyersModel } from 'fyers-api-v3';

declare module 'fastify' {
  interface FastifyInstance {
    fyers: fyersModel;
    ensureFyersSession?: (options?: {
      verifyWithApi?: boolean;
    }) => Promise<boolean>;
    mongo?: {
      client: MongoClient;
      ObjectId: typeof ObjectId;
      db?: Db;
    };
    fyersMarketStream?: {
      getIndexLtp: (symbol: string) => number | null;
      getOptionLtp: (symbol: string) => number | null;
    };
    optionChainStreamHub?: {
      resolveStrikeGreeks: (
        indexSymbol: string,
        strike: number,
        type: 'CE' | 'PE',
      ) => {
        delta: number | null;
        gamma: number | null;
        theta: number | null;
        vega: number | null;
        iv: number | null;
      } | null;
    };
  }
}

export {};