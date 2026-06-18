export const OPEN_POSITIONS_CACHE_DEFAULTS = {
  /** Reuse Fyers get_positions across telegram poll, deck SSE, and TP monitor. */
  TTL_MS: 12_000,
} as const;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveOpenPositionsCacheTtlMs(): number {
  return parsePositiveInt(
    process.env.OPEN_POSITIONS_CACHE_TTL_MS,
    OPEN_POSITIONS_CACHE_DEFAULTS.TTL_MS,
  );
}