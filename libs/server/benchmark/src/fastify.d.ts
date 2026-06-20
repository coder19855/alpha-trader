import 'fastify';
import type { Db, MongoClient, ObjectId } from 'mongodb';
import type { fyersModel } from 'fyers-api-v3';
import type {
  FlowMode,
  OptionMetricsResponse,
  PriceActionResponse,
  TradeDecisionResult,
  TradingStyle,
  VetoMode,
} from '@alpha-trader/server-shared';
import type { AIAnalysisResponse } from './lib/benchmark-stubs.js';

declare module 'fastify' {
  interface FastifyInstance {
    mongo?: {
      client: MongoClient;
      db: Db;
      ObjectId: typeof ObjectId;
    };
    preferences: import('@alpha-trader/server-preferences').PreferencesService;
    fyers: fyersModel;
    ensureFyersSession: (options?: {
      verifyWithApi?: boolean;
    }) => Promise<boolean>;
    momentumDecayPlugin: {
      computeMomentumDecay: (...args: any[]) => any;
      applyMomentumDecay: (...args: any[]) => any;
      countDirectionalStructure: (...args: any[]) => any;
      computeRecentCandleMomentum: (candles: any[], lookback?: number) => number;
    };
    technicalAnalysisPlugin: Record<string, (...args: any[]) => any>;
    decisionEngine: {
      computeTradeDecision: (
        priceData: PriceActionResponse,
        optionData: OptionMetricsResponse,
        style: TradingStyle,
        options?: {
          vetoMode?: VetoMode;
          flowMode?: FlowMode;
          chaseDecay?: boolean;
        },
      ) => TradeDecisionResult;
      clearDecisionMemory: () => void;
    };
    aiAgent?: {
      analyze: (request: Record<string, unknown>) => Promise<AIAnalysisResponse>;
    };
  }
}

export {};