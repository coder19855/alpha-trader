import './augment-fastify.js';
import { TELEGRAM_NOTIFICATION_DEFAULTS } from '@alpha-trader/server-shared';
import { SignalOutcomeRecord } from '@alpha-trader/server-shared';
import {
  LIVE_TRADE_RR_LABELS,
  LIVE_TRADE_RR_MULTIPLIERS,
  PriceActionResponse,
  Timeframe,
  TradeAction,
  TradeSetup,
  TradeTakeProfitLevel,
} from '@alpha-trader/server-shared';
import { normalizeStopLoss } from '@alpha-trader/server-analysis';
import { FastifyInstance } from 'fastify';

export type HeldDirection = 'CE-BUY' | 'PE-BUY';

export function tradeSetupMatchesHeldDirection(
  heldDirection: HeldDirection,
  setup: TradeSetup,
): boolean {
  if (!setup.entry || !setup.stopLoss || setup.risk <= 0) return false;
  return heldDirection === 'CE-BUY'
    ? setup.entry > setup.stopLoss
    : setup.entry < setup.stopLoss;
}

function resolvePrimaryAtr(priceData: PriceActionResponse): number {
  const tf = (priceData.primaryTimeframe ?? '15m') as Timeframe;
  return (
    priceData.atr?.[tf] ??
    priceData.atr?.['15m'] ??
    priceData.atr?.['5m'] ??
    0
  );
}

function structuralEntryStop(
  heldDirection: HeldDirection,
  priceData: PriceActionResponse,
  entrySpot?: number | null,
): { entry: number; rawStop: number } | null {
  const lastPrice = priceData.lastPrice;
  const levels = priceData.levels;
  if (!lastPrice || lastPrice <= 0 || !levels) return null;

  if (heldDirection === 'CE-BUY') {
    const rawStop = levels.support;
    if (!rawStop || rawStop <= 0) return null;
    const entry = entrySpot && entrySpot > rawStop ? entrySpot : lastPrice;
    if (entry <= rawStop) return null;
    return { entry, rawStop };
  }

  const rawStop = levels.resistance;
  if (!rawStop || rawStop <= 0) return null;
  const entry = entrySpot && entrySpot < rawStop ? entrySpot : lastPrice;
  if (entry >= rawStop) return null;
  return { entry, rawStop };
}

/**
 * Resolves index-spot entry/stop/TP ladder for an open leg even when the live
 * signal is flat (NO-TRADE) or opposite to the held direction.
 */
export function resolveHeldPositionTradeSetup(
  heldDirection: HeldDirection,
  priceData: PriceActionResponse,
  options?: { entrySpot?: number | null },
): TradeSetup | undefined {
  const existing = priceData.tradeSetup;
  if (existing && tradeSetupMatchesHeldDirection(heldDirection, existing)) {
    return existing;
  }

  const structural = structuralEntryStop(
    heldDirection,
    priceData,
    options?.entrySpot,
  );
  if (!structural) return undefined;

  return buildHeldTradeSetup(
    heldDirection,
    structural.entry,
    structural.rawStop,
    resolvePrimaryAtr(priceData),
  );
}

function buildHeldTradeSetup(
  action: TradeAction,
  entry: number,
  rawStopLoss: number,
  atr: number,
): TradeSetup | undefined {
  if (action === 'NO-TRADE' || entry <= 0 || rawStopLoss <= 0) return undefined;

  const { stopLoss, adjusted, reason } = normalizeStopLoss(
    action,
    entry,
    rawStopLoss,
    atr,
  );
  const risk =
    action === 'CE-BUY'
      ? Math.max(0.01, entry - stopLoss)
      : Math.max(0.01, stopLoss - entry);

  const takeProfits: TradeTakeProfitLevel[] = LIVE_TRADE_RR_MULTIPLIERS.map(
    (multiplier, index) => ({
      rr: LIVE_TRADE_RR_LABELS[index],
      multiplier,
      price:
        action === 'CE-BUY'
          ? entry + risk * multiplier
          : entry - risk * multiplier,
    }),
  );

  return {
    entry,
    stopLoss,
    rawStopLoss,
    risk,
    takeProfits,
    stopAdjusted: adjusted,
    stopAdjustReason: reason,
    atrUsed: atr,
  };
}

export async function resolveHeldEntrySpot(
  fastify: FastifyInstance,
  params: {
    indexSymbol: string;
    heldDirection: HeldDirection;
    positionSymbols: string[];
    tradingStyle?: string;
  },
): Promise<number | null> {
  const col = fastify.mongo?.db?.collection<SignalOutcomeRecord>(
    TELEGRAM_NOTIFICATION_DEFAULTS.SIGNAL_OUTCOMES_COLLECTION,
  );
  if (!col) return null;

  for (const optionSymbol of params.positionSymbols) {
    const doc = await col.findOne({
      status: 'open',
      optionSymbol,
      action: params.heldDirection,
    });
    if (doc?.entrySpot && doc.entrySpot > 0) {
      return doc.entrySpot;
    }
  }

  const query: Record<string, unknown> = {
    status: 'open',
    symbol: params.indexSymbol,
    action: params.heldDirection,
  };
  if (params.tradingStyle) {
    query.tradingStyle = params.tradingStyle;
  }

  const latest = await col.findOne(query, { sort: { alertedAt: -1 } });
  return latest?.entrySpot && latest.entrySpot > 0 ? latest.entrySpot : null;
}