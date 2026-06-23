/** Default client poll interval for option chain (5 minutes). */
export const OPTION_CHAIN_POLL_DEFAULT_MS = 300_000;

/**
 * Server-side option-chain overlay (side-car) tuning.
 *
 * The overlay is fetched on its own background cadence and read
 * non-blockingly by the deck signal tick. Option flow (OI/PCR/IV) moves
 * slowly, so a snapshot up to MAX_AGE_MS old is still usable; older than
 * that, the deck degrades to price-action-only rather than blending stale
 * option data. REFRESH_INTERVAL_MS must stay below MAX_AGE_MS so a healthy
 * feed never goes stale between refreshes.
 */
export const OPTION_OVERLAY_DEFAULTS = {
  /** How often the background refresher re-polls the chain per watched symbol. */
  REFRESH_INTERVAL_MS: 20_000,
  /** Max snapshot age the deck will still blend; beyond this → PA-only. */
  MAX_AGE_MS: 90_000,
} as const;

export function normalizeOptionOverlayRefreshMs(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return OPTION_OVERLAY_DEFAULTS.REFRESH_INTERVAL_MS;
  }
  // Keep refresh between 5s and the max-age ceiling so data never goes stale
  // purely because the refresher runs slower than the staleness window.
  return Math.min(OPTION_OVERLAY_DEFAULTS.MAX_AGE_MS, Math.max(5_000, parsed));
}

export const OPTION_CHAIN_POLL_PRESETS = [
  { value: 60_000, label: '1 min' },
  { value: 120_000, label: '2 min' },
  { value: 300_000, label: '5 min' },
  { value: 600_000, label: '10 min' },
  { value: 900_000, label: '15 min' },
  { value: 0, label: 'Manual only' },
] as const;

export function normalizeOptionChainPollMs(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return OPTION_CHAIN_POLL_DEFAULT_MS;
  }
  const allowed = OPTION_CHAIN_POLL_PRESETS.map((p) => p.value);
  if (allowed.includes(parsed as (typeof allowed)[number])) return parsed;
  if (parsed === 0) return 0;
  return Math.min(900_000, Math.max(60_000, parsed));
}