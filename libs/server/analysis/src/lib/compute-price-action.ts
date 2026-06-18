import { FastifyInstance } from 'fastify';
import {
  PriceActionResponse,
  TradingStyle,
  VetoMode,
  parseVetoModeQuery,
} from '@alpha-trader/server-shared';

export async function computePriceAction(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    tradingStyle?: string;
    rangeToMs?: number;
    vetoMode?: VetoMode;
  },
): Promise<PriceActionResponse | null> {
  const style = params.tradingStyle ?? TradingStyle.Intraday;
  const vetoMode = params.vetoMode ?? 'strict';
  const rangeTo = params.rangeToMs ?? Date.now();
  const rangeToSec = Math.floor(
    rangeTo < 10_000_000_000 ? rangeTo : rangeTo / 1000,
  );

  const res = await fastify.inject({
    method: 'GET',
    url:
      `/api/technical-analysis?symbol=${encodeURIComponent(params.symbol)}` +
      `&tradingStyle=${encodeURIComponent(style)}` +
      `&vetoMode=${encodeURIComponent(vetoMode)}` +
      `&range_to=${rangeToSec}`,
  });

  if (res.statusCode !== 200) return null;
  return JSON.parse(res.body) as PriceActionResponse;
}

export { parseVetoModeQuery };