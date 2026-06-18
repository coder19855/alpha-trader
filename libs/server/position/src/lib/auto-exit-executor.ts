import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { resolveOptionMeta, ResponseStatus } from '@alpha-trader/server-shared';
import { HeldDirection } from './position-monitor.js';

function mapFyersProductType(raw: string | undefined): 'CNC' | 'MIS' | 'NRML' {
  const value = String(raw ?? '').toUpperCase();
  if (value.includes('CNC')) return 'CNC';
  if (value.includes('INTRADAY') || value === 'MIS') return 'MIS';
  return 'NRML';
}

export interface AutoExitSquareOffResult {
  attempted: number;
  succeeded: number;
  failed: string[];
  orderIds: string[];
  skipped: string[];
}

function resolveSellQty(totalQty: number, fraction: number): number | null {
  if (totalQty <= 0 || fraction <= 0) return null;
  if (totalQty === 1) return null;
  const qty = Math.max(1, Math.round(totalQty * fraction));
  return Math.min(qty, totalQty - 1);
}

async function squareOffLegs(
  fastify: FastifyInstance,
  params: {
    indexSymbol: string;
    heldDirection: HeldDirection;
    reason: string;
    fraction?: number;
  },
): Promise<AutoExitSquareOffResult> {
  const res = await fastify.fyers.get_positions();
  if (res.s !== ResponseStatus.ok || !res.netPositions?.length) {
    return {
      attempted: 0,
      succeeded: 0,
      failed: ['No open positions from Fyers'],
      orderIds: [],
      skipped: [],
    };
  }

  const legs = res.netPositions.filter((row) => {
    const netQty = Number(row.netQty ?? row.qty ?? 0);
    if (netQty <= 0) return false;
    const meta = resolveOptionMeta(row.symbol);
    if (!meta || meta.indexSymbol !== params.indexSymbol) return false;
    const direction =
      meta.optionType === 'CE' ? 'CE-BUY' : meta.optionType === 'PE' ? 'PE-BUY' : null;
    return direction === params.heldDirection;
  });

  if (!legs.length) {
    return {
      attempted: 0,
      succeeded: 0,
      failed: ['No matching legs to square off'],
      orderIds: [],
      skipped: [],
    };
  }

  const result: AutoExitSquareOffResult = {
    attempted: 0,
    succeeded: 0,
    failed: [],
    orderIds: [],
    skipped: [],
  };

  for (const leg of legs) {
    const totalQty = Number(leg.netQty ?? leg.qty ?? 0);
    if (totalQty <= 0) continue;

    let qty = totalQty;
    if (params.fraction != null && params.fraction < 1) {
      const partialQty = resolveSellQty(totalQty, params.fraction);
      if (partialQty == null) {
        result.skipped.push(
          `${leg.symbol}: only 1 lot — partial ${Math.round(params.fraction * 100)}% skipped`,
        );
        continue;
      }
      qty = partialQty;
    }

    result.attempted += 1;
    try {
      const orderRes = await fastify.fyers.placeOrder({
        symbol: leg.symbol,
        qty,
        type: 'MARKET',
        side: 'SELL',
        product_type: mapFyersProductType(leg.productType),
        validity: 'DAY',
      });
      if (orderRes?.id) {
        result.succeeded += 1;
        result.orderIds.push(String(orderRes.id));
      } else {
        result.failed.push(`${leg.symbol}: order rejected`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push(`${leg.symbol}: ${message}`);
      fastify.log.warn(
        { err, symbol: leg.symbol, reason: params.reason },
        'Auto-exit square-off failed for leg',
      );
    }
  }

  return result;
}

export async function squareOffWatchedIndexLegs(
  fastify: FastifyInstance,
  params: {
    indexSymbol: string;
    heldDirection: HeldDirection;
    reason: string;
  },
): Promise<AutoExitSquareOffResult> {
  return squareOffLegs(fastify, params);
}

export async function squareOffPartialWatchedIndexLegs(
  fastify: FastifyInstance,
  params: {
    indexSymbol: string;
    heldDirection: HeldDirection;
    reason: string;
    fraction: number;
  },
): Promise<AutoExitSquareOffResult> {
  return squareOffLegs(fastify, { ...params, fraction: params.fraction });
}