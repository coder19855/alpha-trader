export const FYERS_MARKET_STREAM_DEFAULTS = {
  INDIA_VIX_SYMBOL: 'NSE:INDIAVIX-INDEX',
  SESSION_CHECK_MS: 30_000,
  AUTO_RECONNECT_TRIES: 8,
  QUOTE_MAX_AGE_MS: 120_000,
  SPOT_RING_MAX_POINTS: 540,
  SPOT_RING_MAX_AGE_MS: 90 * 60 * 1000,
  /** Hard cap on number of distinct quote symbols held in memory. */
  MAX_QUOTE_SYMBOLS: 2_000,
  /** Base interval for periodic WS symbol reconciliation (ms). */
  RECONCILE_BASE_MS: 60_000,
  /** ± jitter applied to reconciliation interval to avoid thundering-herd (ms). */
  RECONCILE_JITTER_MS: 15_000,
  /** Coalescing window: batch outbound tick notifications before firing listeners (ms). */
  TICK_COALESCE_MS: 200,
  /** Default WS chain policy: index/vix + held legs only; ATM window when flat. */
  CHAIN_SUBSCRIBE_MODE: 'position-first' as FyersWsChainSubscribeMode,
  ATM_STRIKE_WINDOW: 2,
} as const;

export type FyersWsChainSubscribeMode =
  | 'position-first'
  | 'atm-window'
  | 'full';

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Disabled in test unless FYERS_WS_ENABLED=true. */
export function resolveFyersWsEnabled(): boolean {
  if (process.env.FYERS_WS_ENABLED === 'true') return true;
  if (process.env.FYERS_WS_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

export function resolveFyersWsLiteMode(): boolean {
  return parseBool(process.env.FYERS_WS_LITE_MODE, true);
}

export function resolveFyersWsSessionCheckMs(): number {
  return parsePositiveInt(
    process.env.FYERS_WS_SESSION_CHECK_MS,
    FYERS_MARKET_STREAM_DEFAULTS.SESSION_CHECK_MS,
  );
}

export function resolveFyersWsChainSubscribeMode(): FyersWsChainSubscribeMode {
  const raw = process.env.FYERS_WS_CHAIN_SUBSCRIBE?.trim().toLowerCase();
  if (raw === 'full' || raw === 'atm-window' || raw === 'position-first') {
    return raw;
  }
  return FYERS_MARKET_STREAM_DEFAULTS.CHAIN_SUBSCRIBE_MODE;
}

function parseNonNegativeInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Strikes above/below ATM included when flat (position-first) or in atm-window mode. */
export function resolveFyersWsAtmStrikeWindow(): number {
  return parseNonNegativeInt(
    process.env.FYERS_WS_ATM_STRIKE_WINDOW,
    FYERS_MARKET_STREAM_DEFAULTS.ATM_STRIKE_WINDOW,
  );
}