import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  FYERS_OPTION_INDEX_SYMBOLS,
  parseStrikeFromFyersOptionSymbol,
} from '@alpha-trader/server-shared';
import { fetchOpenIndexOptionPositions } from '@alpha-trader/server-position';
import { OpenPositionMonitorContext } from '@alpha-trader/server-shared';

export interface DeckOpenPositionEntry {
  symbol: string;
  optionLabel: string;
  indexSymbol: string;
  indexLabel: string;
  direction: 'CE-BUY' | 'PE-BUY';
  netQty: number;
  lots: number;
  lotSize: number;
  buyAvg: number;
  ltp: number | null;
  unrealizedPnl: number;
  strike: number | null;
  spot: number | null;
  isWatchedIndex: boolean;
}

export interface DeckOpenPositionsPayload {
  asOf: string;
  entries: DeckOpenPositionEntry[];
  note: string | null;
  ltpOnly?: boolean;
}

function indexLotSize(indexSymbol: string): number {
  return (
    FYERS_OPTION_INDEX_SYMBOLS.find((row) => row.symbol === indexSymbol)
      ?.lotSize ?? 1
  );
}

function shortIndexLabel(indexSymbol: string): string {
  const part = indexSymbol.split(':')[1] || indexSymbol;
  return part.replace('-INDEX', '');
}

function resolvePositionLtp(
  fastify: FastifyInstance,
  symbol: string,
  fallback?: number | null,
): number | null {
  const streamed = fastify.fyersMarketStream?.getOptionLtp(symbol);
  if (streamed != null && Number.isFinite(streamed)) return streamed;
  return fallback ?? null;
}

function estimateUnrealizedPnl(
  buyAvg: number,
  ltp: number,
  netQty: number,
): number | null {
  if (
    !Number.isFinite(buyAvg) ||
    !Number.isFinite(ltp) ||
    !Number.isFinite(netQty) ||
    buyAvg <= 0 ||
    ltp <= 0 ||
    netQty <= 0
  ) {
    return null;
  }
  return Math.round((ltp - buyAvg) * netQty * 100) / 100;
}

export function refreshDeckOpenPositionsLtp(
  fastify: FastifyInstance,
  payload: DeckOpenPositionsPayload,
): DeckOpenPositionsPayload {
  if (!payload.entries.length) {
    return { ...payload, asOf: new Date().toISOString(), ltpOnly: true };
  }

  const entries = payload.entries.map((entry) => {
    const ltp = resolvePositionLtp(fastify, entry.symbol, entry.ltp);
    const spot =
      fastify.fyersMarketStream?.getIndexLtp(entry.indexSymbol) ?? entry.spot;
    const estimated =
      ltp != null ? estimateUnrealizedPnl(entry.buyAvg, ltp, entry.netQty) : null;

    return {
      ...entry,
      ltp: ltp ?? entry.ltp,
      spot: spot ?? entry.spot,
      unrealizedPnl: estimated ?? entry.unrealizedPnl,
    };
  });

  return {
    ...payload,
    asOf: new Date().toISOString(),
    note: payload.note,
    entries,
    ltpOnly: true,
  };
}

function mapPositionToDeckEntry(
  fastify: FastifyInstance,
  position: OpenPositionMonitorContext,
  watchedIndexSymbol: string,
): DeckOpenPositionEntry {
  const lotSize = indexLotSize(position.indexSymbol);
  const netQty = Math.abs(position.netQty);
  const lots = lotSize > 0 ? Math.round((netQty / lotSize) * 100) / 100 : netQty;
  const strike = parseStrikeFromFyersOptionSymbol(position.symbol);

  const ltp = resolvePositionLtp(fastify, position.symbol, null);
  const spot =
    fastify.fyersMarketStream?.getIndexLtp(position.indexSymbol) ?? null;
  const estimated =
    ltp != null
      ? estimateUnrealizedPnl(position.buyAvg, ltp, netQty)
      : position.unrealizedPnl;

  return {
    symbol: position.symbol,
    optionLabel: position.optionLabel,
    indexSymbol: position.indexSymbol,
    indexLabel: position.indexLabel || shortIndexLabel(position.indexSymbol),
    direction: position.direction,
    netQty,
    lots,
    lotSize,
    buyAvg: position.buyAvg,
    ltp,
    unrealizedPnl: estimated ?? position.unrealizedPnl,
    strike,
    spot,
    isWatchedIndex: position.indexSymbol === watchedIndexSymbol,
  };
}

export async function buildDeckOpenPositions(
  fastify: FastifyInstance,
  watchedIndexSymbol: string,
  preloaded?: OpenPositionMonitorContext[],
): Promise<DeckOpenPositionsPayload> {
  const positions =
    preloaded ??
    (await fetchOpenIndexOptionPositions(fastify, [watchedIndexSymbol]));
  const entries = positions
    .filter((p) => p.indexSymbol === watchedIndexSymbol)
    .map((p) => mapPositionToDeckEntry(fastify, p, watchedIndexSymbol));

  return {
    asOf: new Date().toISOString(),
    entries,
    note:
      entries.length === 0
        ? 'No open index option legs for this symbol.'
        : null,
  };
}