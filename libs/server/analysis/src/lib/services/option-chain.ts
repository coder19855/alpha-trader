import '../augment-fastify.js';
import { FastifyInstance } from 'fastify';

import { HttpStatusCode } from 'axios';
import {
  GreeksMoneyness,
  ResponseStatus,
  TradingStyle,
} from '@alpha-trader/server-shared';
import { buildOptionChainSignalResponse } from '../option-chain/build-option-chain-signal.js';

function normalizeTradingStyle(value: unknown): TradingStyle {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'SCALPER' || raw === TradingStyle.Scalper) return TradingStyle.Scalper;
  if (raw === 'POSITIONAL' || raw === TradingStyle.Positional) {
    return TradingStyle.Positional;
  }
  return TradingStyle.Intraday;
}

function normalizeMoneyness(value: unknown): GreeksMoneyness | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'ATM' || raw === 'ITM' || raw === 'OTM') return raw;
  return undefined;
}

function normalizeOptionSide(value: unknown): 'CE' | 'PE' {
  const raw = String(value ?? '').trim().toUpperCase();
  return raw === 'PE' ? 'PE' : 'CE';
}

export default async function optionChainRoute(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get<{
    Querystring: {
      symbol?: string;
      style?: string;
      refresh?: string;
      moneyness?: string;
      side?: string;
      paAction?: string;
    };
  }>('/api/option-chain', async (request, reply) => {
    const symbol = String(request.query.symbol ?? 'NSE:NIFTY50-INDEX').trim();
    const tradingStyle = normalizeTradingStyle(request.query.style);
    const moneyness = normalizeMoneyness(request.query.moneyness);
    const optionSide = normalizeOptionSide(request.query.side);
    const paAction = request.query.paAction?.trim();
    const forceRefresh =
      request.query.refresh === 'true' || request.query.refresh === '1';
    try {
      const payload = await buildOptionChainSignalResponse(fastify, {
        symbol,
        tradingStyle,
        paAction,
        moneyness,
        optionSide,
        forceRefresh,
      });
      return reply.send(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      request.log.error({ err, symbol, message }, 'option-chain fetch failed');
      const status =
        message.includes('Fyers is not connected') ||
        message.toLowerCase().includes('auth')
        ? HttpStatusCode.Unauthorized
        : HttpStatusCode.InternalServerError;
      return reply.status(status).send({
        s: ResponseStatus.error,
        error: message,
      });
    }
  });
}