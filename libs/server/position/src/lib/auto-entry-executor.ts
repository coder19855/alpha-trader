import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { FyersAPI } from 'fyers-api-v3';
import {
  FYERS_OPTION_INDEX_SYMBOLS,
  ResponseStatus,
} from '@alpha-trader/server-shared';
import { HeldDirection } from './position-monitor.js';

export interface AutoEntryOrderResult {
  attempted: boolean;
  succeeded: boolean;
  orderId: string | null;
  symbol: string | null;
  strike: number | null;
  qty: number;
  error: string | null;
}

function indexLotSize(indexSymbol: string): number {
  return (
    FYERS_OPTION_INDEX_SYMBOLS.find((row) => row.symbol === indexSymbol)
      ?.lotSize ?? 65
  );
}

function findAtmStrike(chain: FyersAPI.OptionChainData[], spot: number): number {
  const strikes = [...new Set(chain.map((r) => r.strike_price))].sort(
    (a, b) => a - b,
  );
  if (!strikes.length) return Math.round(spot / 50) * 50;
  return strikes.reduce((best, s) =>
    Math.abs(s - spot) < Math.abs(best - spot) ? s : best,
  );
}

export async function resolveAtmOptionLeg(
  fastify: FastifyInstance,
  indexSymbol: string,
  direction: HeldDirection,
): Promise<{
  symbol: string;
  strike: number;
  ltp: number;
  lotSize: number;
} | null> {
  const side = direction === 'CE-BUY' ? 'CE' : 'PE';
  const chainRes = await fastify.fyers.getOptionChain({
    symbol: indexSymbol,
    strikecount: 8,
    timestamp: '',
    greeks: 0,
  } as FyersAPI.OptionChainRequest);

  if (chainRes.s !== 'ok' || !chainRes.data?.optionsChain?.length) {
    return null;
  }

  const chain = chainRes.data.optionsChain;
  const spot =
    fastify.fyersMarketStream?.getIndexLtp(indexSymbol) ??
    chain.find((r) => r.option_type === 'CE')?.strike_price ??
    0;
  const atm = findAtmStrike(chain, spot);
  const sideRows = chain.filter((r) => r.option_type === side);
  if (!sideRows.length) return null;
  const row =
    sideRows.find((r) => r.strike_price === atm) ??
    sideRows.reduce((best, r) =>
      Math.abs(r.strike_price - atm) < Math.abs(best.strike_price - atm)
        ? r
        : best,
    );

  if (!row?.symbol) return null;

  return {
    symbol: row.symbol,
    strike: row.strike_price,
    ltp: row.ltp ?? 0,
    lotSize: indexLotSize(indexSymbol),
  };
}

export async function simulateAutoEntryBuy(
  fastify: FastifyInstance,
  params: {
    indexSymbol: string;
    direction: HeldDirection;
    lots: number;
    reason: string;
  },
): Promise<AutoEntryOrderResult> {
  const leg = await resolveAtmOptionLeg(
    fastify,
    params.indexSymbol,
    params.direction,
  );
  if (!leg) {
    return {
      attempted: false,
      succeeded: false,
      orderId: null,
      symbol: null,
      strike: null,
      qty: 0,
      error: 'Could not resolve ATM option symbol from chain',
    };
  }

  const qty = Math.max(leg.lotSize, params.lots * leg.lotSize);
  fastify.log.info(
    {
      dryRun: true,
      symbol: leg.symbol,
      strike: leg.strike,
      qty,
      ltp: leg.ltp,
      reason: params.reason,
    },
    'Auto-entry dry-run (no order placed)',
  );
  return {
    attempted: true,
    succeeded: true,
    orderId: null,
    symbol: leg.symbol,
    strike: leg.strike,
    qty,
    error: null,
  };
}

export async function placeAutoEntryBuy(
  fastify: FastifyInstance,
  params: {
    indexSymbol: string;
    direction: HeldDirection;
    lots: number;
    reason: string;
  },
): Promise<AutoEntryOrderResult> {
  const leg = await resolveAtmOptionLeg(
    fastify,
    params.indexSymbol,
    params.direction,
  );
  if (!leg) {
    return {
      attempted: false,
      succeeded: false,
      orderId: null,
      symbol: null,
      strike: null,
      qty: 0,
      error: 'Could not resolve ATM option symbol from chain',
    };
  }

  const qty = Math.max(leg.lotSize, params.lots * leg.lotSize);
  try {
    const orderRes = await fastify.fyers.place_order({
      symbol: leg.symbol,
      qty,
      type: 'MARKET',
      side: 'BUY',
      product_type: 'MIS',
      validity: 'DAY',
    });
    if (orderRes?.id) {
      return {
        attempted: true,
        succeeded: true,
        orderId: String(orderRes.id),
        symbol: leg.symbol,
        strike: leg.strike,
        qty,
        error: null,
      };
    }
    return {
      attempted: true,
      succeeded: false,
      orderId: null,
      symbol: leg.symbol,
      strike: leg.strike,
      qty,
      error: 'Order rejected by broker',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fastify.log.warn(
      { err, symbol: leg.symbol, reason: params.reason },
      'Auto-entry buy failed',
    );
    return {
      attempted: true,
      succeeded: false,
      orderId: null,
      symbol: leg.symbol,
      strike: leg.strike,
      qty,
      error: message,
    };
  }
}

export async function hasFyersSession(fastify: FastifyInstance): Promise<boolean> {
  try {
    const res = await fastify.fyers.get_positions();
    return res.s === ResponseStatus.ok;
  } catch {
    return false;
  }
}