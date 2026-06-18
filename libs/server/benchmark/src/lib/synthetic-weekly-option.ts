import { FYERS_OPTION_INDEX_SYMBOLS } from '@alpha-trader/server-shared';
import { getNseSessionCloseSec } from '@alpha-trader/server-analysis';

export const SYNTHETIC_WEEKLY_OPTION = {
  MIN_PREMIUM: 30,
  MAX_PREMIUM: 250,
  MIN_DELTA: 0.3,
  MAX_DELTA: 0.75,
  /** Wed→Tue weekly cycle (~5 calendar days to expiry). */
  MAX_DTE_MS: 5 * 24 * 60 * 60 * 1000,
  DEFAULT_LOTS: 1,
} as const;

const IST_WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface SyntheticWeeklyOptionInput {
  signalAtMs: number;
  exitAtMs: number;
  action: 'CE-BUY' | 'PE-BUY';
  indexEntry: number;
  indexExit: number;
  symbol?: string;
}

export interface SyntheticWeeklyOptionResult {
  entryPremium: number;
  exitPremium: number;
  delta: number;
  dteDays: number;
  msToExpiry: number;
  lotSize: number;
  lots: number;
  pnlInr: number;
  thetaDecay: number;
}

function getIstWeekday(epochSec: number): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(new Date(epochSec * 1000));
  return IST_WEEKDAY[label] ?? 0;
}

/** Milliseconds until the current week's Tuesday 15:30 IST expiry. */
export function msToTuesdayWeeklyExpiry(signalAtMs: number): number {
  const epochSec = Math.floor(signalAtMs / 1000);
  const weekday = getIstWeekday(epochSec);
  let daysToExpiry: number;

  if (weekday === 2) {
    const closeSec = getNseSessionCloseSec(epochSec);
    daysToExpiry = epochSec >= closeSec ? 7 : 0;
  } else {
    daysToExpiry = (2 - weekday + 7) % 7;
    if (daysToExpiry === 0) daysToExpiry = 7;
  }

  const expirySec = getNseSessionCloseSec(epochSec + daysToExpiry * 86_400);
  return Math.max(0, expirySec * 1000 - signalAtMs);
}

function deterministicUnit(seed: number, salt: number): number {
  const mixed = Math.abs((seed ^ salt) * 2654435761) % 10_000;
  return mixed / 10_000;
}

function clampPremium(value: number): number {
  return +Math.min(
    SYNTHETIC_WEEKLY_OPTION.MAX_PREMIUM,
    Math.max(SYNTHETIC_WEEKLY_OPTION.MIN_PREMIUM, value),
  ).toFixed(2);
}

export function resolveBenchmarkLotSize(symbol?: string): number {
  if (!symbol) return 65;
  const meta = FYERS_OPTION_INDEX_SYMBOLS.find((row) => row.symbol === symbol);
  return meta?.lotSize ?? 65;
}

/** Premium rises toward 250 early in the week and decays toward 30 at Tuesday expiry. */
export function basePremiumFromDte(msToExpiry: number): number {
  const ratio = Math.min(1, msToExpiry / SYNTHETIC_WEEKLY_OPTION.MAX_DTE_MS);
  const base =
    SYNTHETIC_WEEKLY_OPTION.MIN_PREMIUM +
    (SYNTHETIC_WEEKLY_OPTION.MAX_PREMIUM - SYNTHETIC_WEEKLY_OPTION.MIN_PREMIUM) *
      ratio;
  return +base.toFixed(2);
}

export function deterministicWeeklyOptionDelta(signalAtMs: number): number {
  const unit = deterministicUnit(signalAtMs, 0x9e37);
  return +(
    SYNTHETIC_WEEKLY_OPTION.MIN_DELTA +
    unit * (SYNTHETIC_WEEKLY_OPTION.MAX_DELTA - SYNTHETIC_WEEKLY_OPTION.MIN_DELTA)
  ).toFixed(3);
}

function signedIndexMove(
  action: 'CE-BUY' | 'PE-BUY',
  indexEntry: number,
  indexExit: number,
): number {
  if (action === 'CE-BUY') return +(indexExit - indexEntry).toFixed(2);
  return +(indexEntry - indexExit).toFixed(2);
}

function computeThetaDecay(
  entryPremium: number,
  msToExpiry: number,
  holdMs: number,
): number {
  if (msToExpiry <= 0 || holdMs <= 0) return 0;
  const timeValue = Math.max(0, entryPremium - SYNTHETIC_WEEKLY_OPTION.MIN_PREMIUM);
  const decay = timeValue * Math.min(1, holdMs / msToExpiry);
  return +decay.toFixed(2);
}

export function simulateSyntheticWeeklyOption(
  input: SyntheticWeeklyOptionInput,
): SyntheticWeeklyOptionResult {
  const msToExpiry = msToTuesdayWeeklyExpiry(input.signalAtMs);
  const dteDays = +(msToExpiry / (24 * 60 * 60 * 1000)).toFixed(2);
  const delta = deterministicWeeklyOptionDelta(input.signalAtMs);
  const jitter = deterministicUnit(input.signalAtMs, 0x517c) * 0.12 - 0.06;
  const entryPremium = clampPremium(basePremiumFromDte(msToExpiry) * (1 + jitter));

  const holdMs = Math.max(0, input.exitAtMs - input.signalAtMs);
  const indexMove = signedIndexMove(
    input.action,
    input.indexEntry,
    input.indexExit,
  );
  const deltaPnl = delta * indexMove;
  const thetaDecay = computeThetaDecay(entryPremium, msToExpiry, holdMs);
  const exitPremium = clampPremium(entryPremium + deltaPnl - thetaDecay);

  const lotSize = resolveBenchmarkLotSize(input.symbol);
  const lots = SYNTHETIC_WEEKLY_OPTION.DEFAULT_LOTS;
  const pnlInr = +((exitPremium - entryPremium) * lotSize * lots).toFixed(2);

  return {
    entryPremium,
    exitPremium,
    delta,
    dteDays,
    msToExpiry,
    lotSize,
    lots,
    pnlInr,
    thetaDecay,
  };
}

export const SYNTHETIC_WEEKLY_OPTION_NOTE =
  'Synthetic weekly option P&L: engine signals still use index spot; capital uses 1-lot option premium (₹30–250, delta 0.3–0.75) with theta decay to Tuesday 15:30 IST expiry.';