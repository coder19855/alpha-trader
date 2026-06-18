import { FYERS_OPTION_INDEX_SYMBOLS } from '@alpha-trader/server-shared';
import { resolveOptionMeta } from '@alpha-trader/server-shared';
import { OpenPositionMonitorContext } from '@alpha-trader/server-shared';
import { FyersWsPositionRow } from './fyers-order-socket-adapter.js';

export interface OpenPositionsCacheSnapshot {
  fetchedAt: number;
  positions: OpenPositionMonitorContext[];
  source: 'rest' | 'ws';
}

export interface WsPositionChange {
  indexSymbol: string;
  symbol: string;
  removed: boolean;
}

let cache: OpenPositionsCacheSnapshot | null = null;
let wsLive = false;
let wsUpdates = 0;
let lastWsUpdateAt: number | null = null;

function shortIndexLabel(symbol: string): string {
  const meta = FYERS_OPTION_INDEX_SYMBOLS.find((row) => row.symbol === symbol);
  return meta?.shortName ?? symbol.split(':')[1]?.replace('-INDEX', '') ?? symbol;
}

function optionLabel(symbol: string): string {
  return symbol.split(':').pop() ?? symbol;
}

function positionDirection(optionType: 'CE' | 'PE'): 'CE-BUY' | 'PE-BUY' {
  return optionType === 'CE' ? 'CE-BUY' : 'PE-BUY';
}

export function mapFyersPositionRowToMonitorContext(
  row: FyersWsPositionRow,
): OpenPositionMonitorContext | null {
  const symbol = String(row.symbol ?? '').trim();
  if (!symbol) return null;

  const meta = resolveOptionMeta(symbol);
  if (!meta) return null;

  const netQty = Number(row.netQty ?? row.qty ?? 0);
  if (!Number.isFinite(netQty) || netQty <= 0) return null;

  return {
    symbol,
    optionLabel: optionLabel(symbol),
    indexSymbol: meta.indexSymbol,
    indexLabel: shortIndexLabel(meta.indexSymbol),
    direction: positionDirection(meta.optionType),
    netQty,
    buyAvg: Number(row.buyAvg ?? 0),
    unrealizedPnl: Number(row.unrealized_profit ?? row.pl ?? 0),
  };
}

export function seedOpenPositionsCache(
  positions: OpenPositionMonitorContext[],
  source: 'rest' | 'ws' = 'rest',
): void {
  cache = {
    fetchedAt: Date.now(),
    positions: [...positions],
    source,
  };
}

export function getHeldOptionSymbolsForIndex(indexSymbol: string): string[] {
  if (!cache) return [];
  return cache.positions
    .filter((position) => position.indexSymbol === indexSymbol)
    .map((position) => position.symbol);
}

export function getAllHeldOptionSymbols(): string[] {
  if (!cache) return [];
  return cache.positions.map((position) => position.symbol);
}

export function getOpenPositionsCacheSnapshot(): OpenPositionsCacheSnapshot | null {
  if (!cache) return null;
  return {
    fetchedAt: cache.fetchedAt,
    positions: [...cache.positions],
    source: cache.source,
  };
}

export function setOpenPositionsWsLive(live: boolean): void {
  wsLive = live;
}

export function isOpenPositionsWsLive(): boolean {
  return wsLive;
}

export function getOpenPositionsWsStats(): {
  wsLive: boolean;
  wsUpdates: number;
  lastWsUpdateAt: string | null;
  cachedLegs: number;
} {
  return {
    wsLive,
    wsUpdates,
    lastWsUpdateAt: lastWsUpdateAt
      ? new Date(lastWsUpdateAt).toISOString()
      : null,
    cachedLegs: cache?.positions.length ?? 0,
  };
}

export function clearOpenPositionsCache(): void {
  cache = null;
  wsUpdates = 0;
  lastWsUpdateAt = null;
}

export function applyWsPositionUpdate(
  row: FyersWsPositionRow,
): WsPositionChange | null {
  const symbol = String(row.symbol ?? '').trim();
  if (!symbol) return null;

  const meta = resolveOptionMeta(symbol);
  if (!meta) return null;

  const mapped = mapFyersPositionRowToMonitorContext(row);
  const now = Date.now();

  if (!cache) {
    cache = { fetchedAt: now, positions: [], source: 'ws' };
  }

  const index = cache.positions.findIndex((entry) => entry.symbol === symbol);
  if (mapped) {
    if (index >= 0) {
      cache.positions[index] = mapped;
    } else {
      cache.positions.push(mapped);
    }
  } else if (index >= 0) {
    cache.positions.splice(index, 1);
  } else {
    return null;
  }

  cache.fetchedAt = now;
  cache.source = 'ws';
  wsUpdates += 1;
  lastWsUpdateAt = now;

  return {
    indexSymbol: meta.indexSymbol,
    symbol,
    removed: mapped == null,
  };
}