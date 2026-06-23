import { OptionMetricsResponse, TradingStyle } from '@alpha-trader/server-shared';
import { computePaDecision } from './compute-pa-decision.js';

/**
 * computePaDecision must NEVER fetch option data — it only forwards whatever
 * (already-cached) metrics it is handed and picks the flow mode accordingly.
 * These tests pin that contract so the "options never delay the trigger"
 * guarantee can't silently regress.
 */
describe('computePaDecision flow selection', () => {
  function makeFastify() {
    const calls: Array<{ option: unknown; opts: unknown }> = [];
    const fastify = {
      decisionEngine: {
        computeTradeDecision: (
          _price: unknown,
          option: unknown,
          _style: unknown,
          opts: unknown,
        ) => {
          calls.push({ option, opts });
          return { action: 'NEUTRAL' };
        },
      },
    } as never;
    return { fastify, calls };
  }

  const price = { signal: { action: 'NEUTRAL' } } as never;

  it('uses pa-only flow and EMPTY metrics when no option metrics supplied', () => {
    const { fastify, calls } = makeFastify();
    computePaDecision(fastify, price, TradingStyle.Intraday, { vetoMode: 'strict' });
    expect(calls).toHaveLength(1);
    expect((calls[0].opts as { flowMode: string }).flowMode).toBe('pa-only');
    expect((calls[0].option as OptionMetricsResponse).signal).toBe('NEUTRAL');
    expect((calls[0].option as OptionMetricsResponse).spotLtp).toBe(0);
  });

  it('uses blend flow and forwards the supplied metrics when present', () => {
    const { fastify, calls } = makeFastify();
    const optionMetrics: OptionMetricsResponse = {
      spotSymbol: 'NSE:NIFTY50-INDEX',
      spotLtp: 22000,
      spotLtpChangePercent: 0.4,
      score: 40,
      signal: 'BULLISH_TRADE',
      bias: 'Moderate Bullish',
      ivRegime: 'Normal IV',
    };
    computePaDecision(fastify, price, TradingStyle.Intraday, {
      vetoMode: 'strict',
      optionMetrics,
    });
    expect((calls[0].opts as { flowMode: string }).flowMode).toBe('blend');
    expect(calls[0].option).toBe(optionMetrics);
  });

  it('falls back to pa-only when optionMetrics is explicitly null', () => {
    const { fastify, calls } = makeFastify();
    computePaDecision(fastify, price, TradingStyle.Intraday, {
      optionMetrics: null,
    });
    expect((calls[0].opts as { flowMode: string }).flowMode).toBe('pa-only');
  });
});
