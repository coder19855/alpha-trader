import {
  BENCHMARK_DAILY_LOSS_CAP_R,
  BENCHMARK_GREEN_DAY_STOP_MIN_R,
} from '@alpha-trader/server-shared';

export interface BenchmarkSessionDayState {
  cumulativePnlR: number;
  greenDayLocked: boolean;
  lossCapLocked: boolean;
}

export interface BenchmarkSessionDayPolicy {
  greenDayStop?: boolean;
  dailyLossCapR?: number;
}

export function createBenchmarkSessionDayState(): BenchmarkSessionDayState {
  return {
    cumulativePnlR: 0,
    greenDayLocked: false,
    lossCapLocked: false,
  };
}

export function isBenchmarkSessionDayBlocked(
  state: BenchmarkSessionDayState,
  policy: BenchmarkSessionDayPolicy,
): boolean {
  if (policy.greenDayStop && state.greenDayLocked) return true;
  if (policy.dailyLossCapR != null && state.lossCapLocked) return true;
  return false;
}

export function applyBenchmarkTradeToSessionDay(
  state: BenchmarkSessionDayState,
  tradePnlR: number,
  policy: BenchmarkSessionDayPolicy,
): BenchmarkSessionDayState {
  const cumulativePnlR = +(state.cumulativePnlR + tradePnlR).toFixed(3);
  const next: BenchmarkSessionDayState = {
    ...state,
    cumulativePnlR,
  };

  if (
    policy.greenDayStop &&
    tradePnlR >= BENCHMARK_GREEN_DAY_STOP_MIN_R
  ) {
    next.greenDayLocked = true;
  }

  if (
    policy.dailyLossCapR != null &&
    cumulativePnlR <= policy.dailyLossCapR
  ) {
    next.lossCapLocked = true;
  }

  return next;
}

export function describeBenchmarkSessionDayPolicy(
  policy: BenchmarkSessionDayPolicy,
): string[] {
  const lines: string[] = [];
  if (policy.greenDayStop) {
    lines.push(
      `Green-day stop: no further entries after any trade closes ≥${BENCHMARK_GREEN_DAY_STOP_MIN_R}R.`,
    );
  }
  if (policy.dailyLossCapR != null) {
    lines.push(
      `Daily loss cap: stop session when day net ≤${policy.dailyLossCapR}R.`,
    );
  }
  return lines;
}

export function resolveBenchmarkDailyLossCapR(
  enabled?: boolean,
  capR?: number,
): number | undefined {
  if (!enabled && capR == null) return undefined;
  if (capR != null && Number.isFinite(capR)) return capR;
  return BENCHMARK_DAILY_LOSS_CAP_R;
}