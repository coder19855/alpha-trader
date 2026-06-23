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
  options?: { vetoMode?: VetoMode; optionMetrics?: OptionMetricsResponse | null },
): TradeDecisionResult {
  // Price action owns the trigger and its timing. Option metrics, when a fresh
  // overlay snapshot is supplied, only blend in to modulate conviction — they
  // are never fetched here, so this stays as fast as the PA-only path. With no
  // option metrics the call is identical to the original PA-only behaviour.
  const optionMetrics = options?.optionMetrics ?? null;
  return fastify.decisionEngine.computeTradeDecision(
    priceAction,
    optionMetrics ?? EMPTY_OPTION_METRICS,
    tradingStyle,
    {
      flowMode: optionMetrics ? 'blend' : 'pa-only',
      vetoMode: options?.vetoMode ?? 'strict',
    },
  );
}