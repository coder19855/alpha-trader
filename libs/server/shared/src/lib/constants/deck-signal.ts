/** Minimum interval between full price-action recomputes per deck channel. */
const DECK_SIGNAL_REFRESH_MIN_MS = 1_000;

/** Default matches pre-OOM live deck behaviour (PA refresh ~every second). */
const DECK_SIGNAL_REFRESH_DEFAULT_MS = 1_000;

/**
 * Env `DECK_SIGNAL_REFRESH_MS` overrides the default (minimum 1s to limit heap churn).
 */
export function resolveDeckSignalRefreshMs(): number {
  const raw = process.env.DECK_SIGNAL_REFRESH_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const ms =
    Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DECK_SIGNAL_REFRESH_DEFAULT_MS;
  return Math.max(DECK_SIGNAL_REFRESH_MIN_MS, ms);
}

export function resolvePaCacheTtlMs(): number {
  return Math.max(500, resolveDeckSignalRefreshMs() - 50);
}