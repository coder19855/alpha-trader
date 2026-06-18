import { getIstSessionClock } from '@alpha-trader/server-shared';

/** IST clock range when new entries are blocked (inclusive start, exclusive end). */
export interface NoTradeWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

const TIME_RANGE_RE =
  /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/;

function parseClockPart(hour: number, minute: number): number | null {
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

export function parseNoTradeWindowToken(token: string): NoTradeWindow | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const colonMatch = trimmed.match(TIME_RANGE_RE);
  if (colonMatch) {
    const startMins = parseClockPart(
      Number(colonMatch[1]),
      Number(colonMatch[2]),
    );
    const endMins = parseClockPart(
      Number(colonMatch[3]),
      Number(colonMatch[4]),
    );
    if (startMins == null || endMins == null || startMins >= endMins) {
      return null;
    }
    return {
      startHour: Math.floor(startMins / 60),
      startMinute: startMins % 60,
      endHour: Math.floor(endMins / 60),
      endMinute: endMins % 60,
    };
  }

  const compact = trimmed.match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (compact) {
    return parseNoTradeWindowToken(
      `${compact[1]}:${compact[2]}-${compact[3]}:${compact[4]}`,
    );
  }

  return null;
}

export function parseNoTradeWindows(
  input: string | string[] | undefined | null,
): NoTradeWindow[] {
  if (input == null) return [];
  const tokens = Array.isArray(input)
    ? input
    : input
        .split(/[\n,;]+/)
        .map((part) => part.trim())
        .filter(Boolean);

  const windows: NoTradeWindow[] = [];
  for (const token of tokens) {
    const parsed = parseNoTradeWindowToken(token);
    if (parsed) windows.push(parsed);
  }
  return windows;
}

export function formatNoTradeWindow(window: NoTradeWindow): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(window.startHour)}:${pad(window.startMinute)}-${pad(window.endHour)}:${pad(window.endMinute)}`;
}

export function formatNoTradeWindows(windows: NoTradeWindow[]): string {
  return windows.map(formatNoTradeWindow).join(', ');
}

export function isWithinNoTradeWindow(
  epochMs: number,
  windows: NoTradeWindow[],
  timezone = 'Asia/Kolkata',
): boolean {
  if (!windows.length) return false;
  const { mins } = getIstSessionClock(epochMs, timezone);
  return windows.some((window) => {
    const startMins = window.startHour * 60 + window.startMinute;
    const endMins = window.endHour * 60 + window.endMinute;
    return mins >= startMins && mins < endMins;
  });
}