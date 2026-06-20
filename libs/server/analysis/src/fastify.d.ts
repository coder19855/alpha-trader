import 'fastify';
import type { fyersModel } from 'fyers-api-v3';
import type { MarketStreamStats } from '@alpha-trader/server-market-data';
import type {
  FlowMode,
  OptionMetricsResponse,
  PriceActionResponse,
  TradeDecisionResult,
  TradingStyle,
  VetoMode,
} from '@alpha-trader/server-shared';

declare module 'fastify' {
  interface FastifyInstance {
    fyers: fyersModel;
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
      analyze: (request: Record<string, unknown>) => Promise<{
        provider: 'GEMINI' | 'GROQ' | 'OPENAI' | 'XAI';
        model: string;
        verdict: 'AGREE' | 'DISAGREE' | 'CAUTION';
        confidenceAdjustment: number;
        betaNote: string;
        timestamp: number;
        available?: boolean;
        errorReason?:
          | 'missing_key'
          | 'invalid_key'
          | 'quota_exhausted'
          | 'rate_limited'
          | 'provider_error'
          | 'parse_error'
          | 'unknown';
      }>;
    };
  }
}

export {};