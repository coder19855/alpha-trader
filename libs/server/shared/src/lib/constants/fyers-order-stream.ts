export const FYERS_ORDER_STREAM_DEFAULTS = {
  SESSION_CHECK_MS: 30_000,
  AUTO_RECONNECT_TRIES: 8,
  /** REST reconcile while order WS is live (safety net). */
  REST_RECONCILE_MS: 300_000,
  /** Debounce deck hub position push after WS events. */
  DECK_PUSH_DEBOUNCE_MS: 300,
} as const;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Disabled in test unless FYERS_ORDER_WS_ENABLED=true. */
export function resolveFyersOrderWsEnabled(): boolean {
  if (process.env.FYERS_ORDER_WS_ENABLED === 'true') return true;
  if (process.env.FYERS_ORDER_WS_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

export function resolveFyersOrderWsSessionCheckMs(): number {
  return parsePositiveInt(
    process.env.FYERS_ORDER_WS_SESSION_CHECK_MS,
    FYERS_ORDER_STREAM_DEFAULTS.SESSION_CHECK_MS,
  );
}

export function resolveOpenPositionsRestReconcileMs(): number {
  return parsePositiveInt(
    process.env.OPEN_POSITIONS_REST_RECONCILE_MS,
    FYERS_ORDER_STREAM_DEFAULTS.REST_RECONCILE_MS,
  );
}

export function resolveDeckPositionsPushDebounceMs(): number {
  return parsePositiveInt(
    process.env.DECK_POSITIONS_PUSH_DEBOUNCE_MS,
    FYERS_ORDER_STREAM_DEFAULTS.DECK_PUSH_DEBOUNCE_MS,
  );
}