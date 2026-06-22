import type { OptionChainSignalResponse } from '@alpha-trader/server-shared';

interface CacheEntry {
  payload: OptionChainSignalResponse;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function optionChainCacheKey(
  symbol: string,
  style: string,
  moneyness?: string,
): string {
  return `${symbol}|${style}|${moneyness ?? 'none'}`;
}

export function getCachedOptionChain(
  key: string,
): OptionChainSignalResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { ...entry.payload, cached: true };
}

export function setCachedOptionChain(
  key: string,
  payload: OptionChainSignalResponse,
  ttlMs: number,
): void {
  cache.set(key, {
    payload: { ...payload, cached: false },
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearOptionChainCache(symbol?: string): void {
  if (!symbol) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${symbol}|`)) cache.delete(key);
  }
}