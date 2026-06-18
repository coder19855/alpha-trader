/** Default paper capital for benchmark P&L projection (INR). */
export const BENCHMARK_DEFAULT_STARTING_CAPITAL_INR = 500_000;

/** Stop session after a trade closes at or above this R (green-day rule). */
export const BENCHMARK_GREEN_DAY_STOP_MIN_R = 1;

/** Default session-day net loss cap in R-multiples. */
export const BENCHMARK_DAILY_LOSS_CAP_R = -2;

export function resolveBenchmarkFlipPollMinutes(): number {
  const raw = Number(process.env.BENCHMARK_FLIP_POLL_MINUTES ?? 15);
  if (!Number.isFinite(raw)) return 15;
  return Math.min(15, Math.max(5, Math.round(raw)));
}

export const BENCHMARK_PROGRESS_MIN_MS = 2_000;
export const BENCHMARK_JOB_MIN_MS = 10 * 60 * 1000;
export const BENCHMARK_JOB_MAX_CAP_MS = 180 * 60 * 1000;
export const BENCHMARK_JOB_MS_PER_REPLAY_BASE = 3 * 60 * 1000;
export const BENCHMARK_JOB_OVERHEAD_MS = 60 * 1000;
export const BENCHMARK_JOB_ABSOLUTE_MAX_MS = 240 * 60 * 1000;

export function resolveBenchmarkJobMaxCapMs(): number {
  const raw = Number(process.env.BENCHMARK_JOB_MAX_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(
      BENCHMARK_JOB_ABSOLUTE_MAX_MS,
      Math.max(BENCHMARK_JOB_MIN_MS, Math.round(raw)),
    );
  }
  return BENCHMARK_JOB_MAX_CAP_MS;
}

export const FYERS_HISTORY_CHUNK_TIMEOUT_MS = 45_000;
export const BENCHMARK_REPLAY_PROGRESS_EVERY = 2;

export function resolveBenchmarkSignalIntervalMinutes(fallback = 15): number {
  const raw = Number(process.env.BENCHMARK_SIGNAL_INTERVAL_MINUTES ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(30, Math.max(15, Math.round(raw)));
}

export const BENCHMARK_FETCH_LOOKBACK_DAYS = 14;

export const BENCHMARK_SNAPSHOT_MAX_BARS = {
  bars5m: 480,
  bars15m: 160,
  bars1h: 64,
} as const;

export const BENCHMARK_STOP_LOSS_NOTE =
  'Stop loss from PA structure; exits simulated with selected trailing policy.';