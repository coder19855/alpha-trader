/** Default: recompute PA on every live quote tick (in-flight dedup prevents OOM storms). */
const DECK_SIGNAL_REFRESH_DEFAULT_MS = 0;

/**
 * Env `DECK_SIGNAL_REFRESH_MS` sets a minimum interval between full PA recomputes per channel.
 * Unset or `0` = every quote tick. Set e.g. `1000` to throttle heap churn on small instances.
 */
export function resolveDeckSignalRefreshMs(): number {
  const raw = process.env.DECK_SIGNAL_REFRESH_MS;
  if (raw === undefined || raw === '') {
    return DECK_SIGNAL_REFRESH_DEFAULT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DECK_SIGNAL_REFRESH_DEFAULT_MS;
  }
  return parsed;
}

export function resolvePaCacheTtlMs(): number {
  const refreshMs = resolveDeckSignalRefreshMs();
  if (refreshMs <= 0) return 0;
  return Math.max(500, refreshMs - 50);
}

export function isDeckSignalCacheFresh(cachedAt: number, now = Date.now()): boolean {
  const ttlMs = resolveDeckSignalRefreshMs();
  return ttlMs > 0 && now - cachedAt < ttlMs;
}

export function isPaResponseCacheFresh(cachedAt: number, now = Date.now()): boolean {
  const ttlMs = resolvePaCacheTtlMs();
  return ttlMs > 0 && now - cachedAt < ttlMs;
}