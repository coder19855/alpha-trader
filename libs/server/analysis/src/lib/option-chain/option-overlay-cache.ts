import {
  OPTION_OVERLAY_DEFAULTS,
  OptionMetricsResponse,
  TradingStyle,
} from '@alpha-trader/server-shared';

/**
 * In-memory option-chain overlay cache.
 *
 * The deck signal path is price-action-first and must never block on an
 * option-chain REST fetch. A background refresher polls the chain on its own
 * cadence and writes the latest computed metrics here; the signal tick reads
 * the freshest entry non-blockingly. When the entry is missing or too old the
 * deck degrades to PA-only — option data can only enrich conviction, never
 * delay the trigger.
 */

export type OptionOverlayStatus = 'fresh' | 'stale' | 'missing';

export interface OptionOverlayEntry {
  metrics: OptionMetricsResponse;
  fetchedAtMs: number;
}

export interface OptionOverlayRead {
  status: OptionOverlayStatus;
  ageMs: number | null;
  /** Metrics are only returned when status is 'fresh'. */
  metrics: OptionMetricsResponse | null;
}

const store = new Map<string, OptionOverlayEntry>();

export function optionOverlayKey(symbol: string, style: TradingStyle): string {
  return `${symbol.trim()}::${style}`;
}

export function setOptionOverlay(
  symbol: string,
  style: TradingStyle,
  metrics: OptionMetricsResponse,
  fetchedAtMs: number,
): void {
  store.set(optionOverlayKey(symbol, style), { metrics, fetchedAtMs });
}

export function peekOptionOverlay(
  symbol: string,
  style: TradingStyle,
): OptionOverlayEntry | null {
  return store.get(optionOverlayKey(symbol, style)) ?? null;
}

/**
 * Read the overlay with an explicit freshness verdict. `metrics` is only
 * non-null when the snapshot is within `maxAgeMs` of `nowMs`, so callers can
 * blend it safely; stale/missing entries return a status the deck surfaces to
 * the user while falling back to PA-only.
 */
export function readOptionOverlay(
  symbol: string,
  style: TradingStyle,
  nowMs: number,
  maxAgeMs: number = OPTION_OVERLAY_DEFAULTS.MAX_AGE_MS,
): OptionOverlayRead {
  const entry = store.get(optionOverlayKey(symbol, style));
  if (!entry) return { status: 'missing', ageMs: null, metrics: null };

  const ageMs = Math.max(0, nowMs - entry.fetchedAtMs);
  if (ageMs > maxAgeMs) {
    return { status: 'stale', ageMs, metrics: null };
  }
  return { status: 'fresh', ageMs, metrics: entry.metrics };
}

/** Test/maintenance helper — clears all cached overlays. */
export function clearOptionOverlay(): void {
  store.clear();
}
