import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { OpenPositionMonitorContext } from '@alpha-trader/server-shared';
import { AutoExitSignal } from './auto-exit-evaluator.js';
import { HeldDirection } from './position-monitor.js';

export interface AutoExitOptionLegTelemetry {
  symbol: string;
  optionLabel: string;
  buyAvg: number;
  ltp: number | null;
  pnlPct: number | null;
  pnlInr: number | null;
  delta: number | null;
  theta: number | null;
  iv: number | null;
}

function resolvePositionLtp(
  fastify: FastifyInstance,
  symbol: string,
): number | null {
  const streamed = fastify.fyersMarketStream?.getOptionLtp(symbol);
  if (streamed != null && Number.isFinite(streamed) && streamed > 0) {
    return streamed;
  }
  return null;
}

function estimatePnlInr(
  buyAvg: number,
  ltp: number,
  netQty: number,
): number | null {
  if (buyAvg <= 0 || ltp <= 0 || netQty <= 0) return null;
  return Math.round((ltp - buyAvg) * netQty * 100) / 100;
}

function resolveLegGreeks(
  fastify: FastifyInstance,
  indexSymbol: string,
  strike: number | null,
  type: 'CE' | 'PE',
): { delta: number | null; theta: number | null; iv: number | null } {
  const hub = fastify.optionChainStreamHub;
  if (!hub || strike == null) {
    return { delta: null, theta: null, iv: null };
  }
  const greeks = hub.resolveStrikeGreeks(indexSymbol, strike, type);
  return {
    delta: greeks?.delta ?? null,
    theta: greeks?.theta ?? null,
    iv: greeks?.iv ?? null,
  };
}

function parseStrike(symbol: string): number | null {
  const match = symbol.match(/(\d{4,6})(?:CE|PE)$/i);
  if (!match) return null;
  const strike = Number(match[1]);
  return Number.isFinite(strike) ? strike : null;
}

export function resolveHeldLegTelemetry(params: {
  fastify: FastifyInstance;
  indexSymbol: string;
  heldDirection: HeldDirection;
  positions?: OpenPositionMonitorContext[];
}): AutoExitOptionLegTelemetry[] {
  const { fastify, indexSymbol, heldDirection } = params;
  const legs =
    params.positions?.filter(
      (p) =>
        p.indexSymbol === indexSymbol.trim() && p.direction === heldDirection,
    ) ?? [];

  return legs.map((leg) => {
    const ltp = resolvePositionLtp(fastify, leg.symbol);
    const buyAvg = leg.buyAvg;
    const netQty = Math.abs(leg.netQty);
    const pnlPct =
      ltp != null && buyAvg > 0
        ? +(((ltp - buyAvg) / buyAvg) * 100).toFixed(2)
        : null;
    const pnlInr =
      ltp != null
        ? estimatePnlInr(buyAvg, ltp, netQty) ?? leg.unrealizedPnl
        : leg.unrealizedPnl;
    const strike = parseStrike(leg.symbol);
    const side: 'CE' | 'PE' = heldDirection === 'CE-BUY' ? 'CE' : 'PE';
    const greeks = resolveLegGreeks(fastify, indexSymbol, strike, side);

    return {
      symbol: leg.symbol,
      optionLabel: leg.optionLabel,
      buyAvg,
      ltp,
      pnlPct,
      pnlInr: pnlInr ?? null,
      delta: greeks.delta,
      theta: greeks.theta,
      iv: greeks.iv,
    };
  });
}

export function evaluateOptionPremiumStop(
  legs: AutoExitOptionLegTelemetry[],
  stopLossPct: number,
): AutoExitSignal | null {
  const threshold = Math.max(5, Math.min(95, stopLossPct));
  let worst: AutoExitOptionLegTelemetry | null = null;
  let worstPct: number | null = null;

  for (const leg of legs) {
    if (leg.buyAvg <= 0 || leg.ltp == null || leg.ltp <= 0) continue;
    const pnlPct = leg.pnlPct ?? ((leg.ltp - leg.buyAvg) / leg.buyAvg) * 100;
    if (pnlPct > -threshold) continue;
    if (worstPct == null || pnlPct < worstPct) {
      worst = leg;
      worstPct = pnlPct;
    }
  }

  if (!worst || worstPct == null || worst.ltp == null) return null;

  const floor = worst.buyAvg * (1 - threshold / 100);
  return {
    hitLevel: 'OPTION_PREMIUM_STOP',
    reason: `Option premium stop — ${worst.optionLabel} LTP ₹${worst.ltp.toFixed(2)} (${worstPct.toFixed(1)}% vs entry ₹${worst.buyAvg.toFixed(2)}, floor ₹${floor.toFixed(2)}).`,
    immediate: true,
  };
}