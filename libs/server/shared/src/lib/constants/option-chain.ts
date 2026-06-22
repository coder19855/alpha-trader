/** Default client poll interval for option chain (5 minutes). */
export const OPTION_CHAIN_POLL_DEFAULT_MS = 300_000;

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