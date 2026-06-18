import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  OptionMetricsResponse,
  PriceActionResponse,
  TradeDecisionResult,
  TradingStyle,
  VetoMode,
} from '@alpha-trader/server-shared';

const EMPTY_OPTION_METRICS: OptionMetricsResponse = {
  spotSymbol: '',
  spotLtp: 0,
  spotLtpChangePercent: 0,
  score: 0,
  signal: 'NEUTRAL',
  bias: 'neutral',
  ivRegime: 'unknown',
};

export function computePaDecision(
  fastify: FastifyInstance,
  priceAction: PriceActionResponse,
  tradingStyle: TradingStyle,
  options?: { vetoMode?: VetoMode },
): TradeDecisionResult {
  return fastify.decisionEngine.computeTradeDecision(
    priceAction,
    EMPTY_OPTION_METRICS,
    tradingStyle,
    { flowMode: 'pa-only', vetoMode: options?.vetoMode ?? 'strict' },
  );
}