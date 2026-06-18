const MS_PER_DAY = 24 * 60 * 60 * 1000;
const IST_OFFSET = '+05:30';

export interface BenchmarkWindowParseResult {
  toMs?: number;
  fromMs?: number;
  days?: number;
}

export interface BenchmarkWindowInput {
  days?: number;
  fromMs?: number;
  toMs?: number;
  windowStartDate?: string;
  windowEndDate?: string;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** IST session open (09:15) for a calendar date. */
export function istSessionOpenMs(date: string): number {
  return new Date(`${date}T09:15:00${IST_OFFSET}`).getTime();
}

/** IST session close (15:30) for a calendar date. */
export function istSessionCloseMs(date: string): number {
  return new Date(`${date}T15:30:00${IST_OFFSET}`).getTime();
}

export function parseBenchmarkDateMs(value: string): number | null {
  const trimmed = value.trim();
  if (!isIsoDate(trimmed)) return null;
  return istSessionCloseMs(trimmed);
}

export function clampBenchmarkDays(value: unknown, fallback = 14): number {
  const n =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n < 3 || n > 90) return fallback;
  return Math.round(n);
}

export function parseBenchmarkWindowToken(
  token: string,
): BenchmarkWindowParseResult | null {
  const raw = token.trim();
  const lower = raw.toLowerCase();

  const daysAtMatch = lower.match(/^(\d{1,3})d@(\d{4}-\d{2}-\d{2})$/);
  if (daysAtMatch) {
    const days = Number(daysAtMatch[1]);
    const toMs = parseBenchmarkDateMs(daysAtMatch[2]);
    if (!Number.isFinite(days) || days < 1 || days > 90 || toMs == null) {
      return null;
    }
    return { days, toMs };
  }

  const toMatch = lower.match(/^(?:to|end)[=:](\d{4}-\d{2}-\d{2})$/);
  if (toMatch) {
    const toMs = parseBenchmarkDateMs(toMatch[1]);
    return toMs == null ? null : { toMs };
  }

  const fromMatch = lower.match(/^from[=:](\d{4}-\d{2}-\d{2})$/);
  if (fromMatch) {
    const fromMs = istSessionOpenMs(fromMatch[1]);
    return Number.isFinite(fromMs) ? { fromMs } : null;
  }

  const atOnly = lower.match(/^@(\d{4}-\d{2}-\d{2})$/);
  if (atOnly) {
    const toMs = parseBenchmarkDateMs(atOnly[1]);
    return toMs == null ? null : { toMs };
  }

  return null;
}

export function formatIstDateLabel(epochMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochMs));
}

/** Inclusive IST calendar-day count between two instants. */
export function countIstInclusiveCalendarDays(
  fromMs: number,
  toMs: number,
): number {
  const startKey = formatIstDateLabel(fromMs);
  const endKey = formatIstDateLabel(toMs);
  const startUtc = new Date(`${startKey}T00:00:00${IST_OFFSET}`).getTime();
  const endUtc = new Date(`${endKey}T00:00:00${IST_OFFSET}`).getTime();
  if (endUtc < startUtc) return 1;
  return Math.max(1, Math.floor((endUtc - startUtc) / MS_PER_DAY) + 1);
}

export interface ResolvedBenchmarkWindow {
  fromMs: number;
  toMs: number;
  days: number;
  windowStartDate: string;
  windowEndDate: string;
}

function resolveLastNDaysWindow(
  toMs: number,
  days: number,
  maxDays: number,
): ResolvedBenchmarkWindow {
  const clampedDays = Math.min(maxDays, Math.max(1, days));
  const fromMs = toMs - clampedDays * MS_PER_DAY;
  return {
    fromMs,
    toMs,
    days: clampedDays,
    windowStartDate: formatIstDateLabel(fromMs),
    windowEndDate: formatIstDateLabel(toMs),
  };
}

function resolveExplicitDateRange(
  fromMs: number,
  toMs: number,
  maxDays: number,
): ResolvedBenchmarkWindow {
  const normalizedFrom = fromMs <= toMs ? fromMs : toMs;
  const normalizedTo = fromMs <= toMs ? toMs : fromMs;
  const inclusiveDays = countIstInclusiveCalendarDays(
    normalizedFrom,
    normalizedTo,
  );
  const days = Math.min(maxDays, Math.max(1, inclusiveDays));
  return {
    fromMs: normalizedFrom,
    toMs: normalizedTo,
    days,
    windowStartDate: formatIstDateLabel(normalizedFrom),
    windowEndDate: formatIstDateLabel(normalizedTo),
  };
}

/**
 * Resolve replay window from days count and/or explicit IST dates.
 *
 * Priority:
 * - Both start + end dates → inclusive calendar span (days input is informational only).
 * - Start only → `days` forward from start (capped at now).
 * - End only → last `days` calendar days ending on end date.
 * - Neither → last `days` calendar days ending now.
 */
export function resolveBenchmarkWindowInput(
  input: BenchmarkWindowInput,
  options?: { nowMs?: number; maxDays?: number },
): ResolvedBenchmarkWindow {
  const nowMs = options?.nowMs ?? Date.now();
  const maxDays = options?.maxDays ?? 90;
  const days = clampBenchmarkDays(input.days);

  let fromMs = input.fromMs;
  let toMs = input.toMs;

  if (input.windowEndDate?.trim()) {
    toMs = parseBenchmarkDateMs(input.windowEndDate.trim()) ?? toMs;
  }
  if (input.windowStartDate?.trim()) {
    fromMs = istSessionOpenMs(input.windowStartDate.trim());
  }

  if (fromMs != null && toMs != null) {
    return resolveExplicitDateRange(fromMs, toMs, maxDays);
  }

  if (fromMs != null) {
    const startKey = formatIstDateLabel(fromMs);
    const startDayMs = new Date(`${startKey}T00:00:00${IST_OFFSET}`).getTime();
    const endDayMs = startDayMs + (days - 1) * MS_PER_DAY;
    const endKey = formatIstDateLabel(endDayMs);
    let resolvedToMs = parseBenchmarkDateMs(endKey) ?? endDayMs;
    const nowEndMs = parseBenchmarkDateMs(formatIstDateLabel(nowMs)) ?? nowMs;
    if (resolvedToMs > nowEndMs) {
      resolvedToMs = nowEndMs;
    }
    return {
      fromMs,
      toMs: resolvedToMs,
      days,
      windowStartDate: startKey,
      windowEndDate: formatIstDateLabel(resolvedToMs),
    };
  }

  const anchorToMs = toMs ?? nowMs;
  return resolveLastNDaysWindow(anchorToMs, days, maxDays);
}

/** @deprecated Prefer resolveBenchmarkWindowInput — kept for timeline parity. */
export function resolveBenchmarkWindow(params: {
  toMs?: number;
  fromMs?: number;
  days?: number;
  nowMs?: number;
  maxDays?: number;
}): ResolvedBenchmarkWindow {
  return resolveBenchmarkWindowInput(
    {
      days: params.days,
      fromMs: params.fromMs,
      toMs: params.toMs,
    },
    { nowMs: params.nowMs, maxDays: params.maxDays },
  );
}