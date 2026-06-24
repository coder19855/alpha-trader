import { FastifyInstance } from 'fastify';
import {
  PriceActionResponse,
  TradingStyle,
  VetoMode,
  parseVetoModeQuery,
  isPaResponseCacheFresh,
} from '@alpha-trader/server-shared';
import { computeLivePriceAction } from './live-price-action.js';

const paResponseCache = new Map<
  string,
  { value: PriceActionResponse; at: number }
>();
const paResponseInFlight = new Map<
  string,
  Promise<PriceActionResponse | null>
>();

function paCacheKey(
  symbol: string,
  style: string,
  vetoMode: VetoMode,
): string {
  return `${symbol.trim()}:${style}:${vetoMode}`;
}

export function invalidatePriceActionCache(symbol?: string): void {
  if (!symbol) {
    paResponseCache.clear();
    return;
  }
  const prefix = `${symbol.trim()}:`;
  for (const key of Array.from(paResponseCache.keys())) {
    if (key.startsWith(prefix)) {
      paResponseCache.delete(key);
    }
  }
}

export async function computePriceAction(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    tradingStyle?: string;
    rangeToMs?: number;
    vetoMode?: VetoMode;
    forceRefresh?: boolean;
  },
): Promise<PriceActionResponse | null> {
  const style = params.tradingStyle ?? TradingStyle.Intraday;
  const vetoMode = params.vetoMode ?? 'strict';
  const cacheKey = paCacheKey(params.symbol, style, vetoMode);
  const now = Date.now();

  if (!params.forceRefresh) {
    const cached = paResponseCache.get(cacheKey);
    if (cached && isPaResponseCacheFresh(cached.at, now)) {
      return cached.value;
    }
    const inFlight = paResponseInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const fetchPromise = computeLivePriceAction(fastify, {
    symbol: params.symbol,
    tradingStyle: style,
    vetoMode,
    rangeToMs: params.rangeToMs,
  })
    .then((value) => {
      if (value) {
        const at = Date.now();
        if (isPaResponseCacheFresh(at, at)) {
          paResponseCache.set(cacheKey, { value, at });
        }
      }
      return value;
    })
    .finally(() => {
      paResponseInFlight.delete(cacheKey);
    });

  paResponseInFlight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export { parseVetoModeQuery };