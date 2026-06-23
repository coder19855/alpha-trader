import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { BENCHMARK_GREEN_DAY_STOP_MIN_R } from '@alpha-trader/server-shared';
import {
  AUTO_ENTRY_PREFERENCE_KEY,
  SESSION_STATE_COLLECTION,
} from './session-state.js';

export type AutoEntrySignalMode = 'engine' | 'single';

export interface AutoEntryPreferenceState {
  enabled: boolean;
  /** Paper mode — resolve ATM leg and log, no Fyers order. */
  dryRun: boolean;
  /** Second arm — required for live MARKET buys when dryRun is off. Resets each IST session day. */
  armedLive: boolean;
  armedLiveSessionDate: string | null;
  signalMode: AutoEntrySignalMode;
  signalProfile: string;
  entryThreshold: number;
  /** When true, engine mode ignores PA chart veto for entry signals. */
  ignoreChartVeto: boolean;
  lots: number;
  maxEntriesPerDay: number;
  greenDayStop: boolean;
}

const DEFAULT_AUTO_ENTRY: AutoEntryPreferenceState = {
  enabled: false,
  dryRun: true,
  armedLive: false,
  armedLiveSessionDate: null,
  signalMode: 'engine',
  signalProfile: 'engine',
  entryThreshold: 60,
  ignoreChartVeto: false,
  lots: 1,
  maxEntriesPerDay: 3,
  greenDayStop: false,
};

function istSessionDate(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function rolloverArmedLive(
  pref: AutoEntryPreferenceState,
  now = new Date(),
): AutoEntryPreferenceState {
  const today = istSessionDate(now);
  if (!pref.armedLive) return pref;
  if (pref.armedLiveSessionDate === today) return pref;
  return { ...pref, armedLive: false, armedLiveSessionDate: null };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeSignalMode(value: unknown): AutoEntrySignalMode {
  return String(value ?? '').trim() === 'single' ? 'single' : 'engine';
}

export function normalizeAutoEntryPreference(
  raw?: Partial<AutoEntryPreferenceState> | null,
  allowedProfiles?: Set<string>,
): AutoEntryPreferenceState {
  const signalMode = normalizeSignalMode(raw?.signalMode);
  let signalProfile = DEFAULT_AUTO_ENTRY.signalProfile;

  if (signalMode === 'engine') {
    signalProfile = 'engine';
  } else {
    const token = String(raw?.signalProfile ?? '').trim();
    if (token && token !== 'engine') {
      signalProfile =
        allowedProfiles && !allowedProfiles.has(token) ? 'breakout-vol' : token;
    } else if (!token || token === 'engine') {
      signalProfile = 'breakout-vol';
    }
  }

  const dryRun = raw?.dryRun === undefined ? true : Boolean(raw?.dryRun);
  let armedLive = Boolean(raw?.armedLive);
  let armedLiveSessionDate =
    raw?.armedLiveSessionDate != null
      ? String(raw.armedLiveSessionDate).trim() || null
      : null;
  if (dryRun) {
    armedLive = false;
    armedLiveSessionDate = null;
  }

  const normalized = rolloverArmedLive({
    enabled: Boolean(raw?.enabled),
    dryRun,
    armedLive,
    armedLiveSessionDate,
    signalMode,
    signalProfile,
    entryThreshold: clampInt(raw?.entryThreshold, 40, 85, 60),
    ignoreChartVeto: Boolean(raw?.ignoreChartVeto),
    lots: clampInt(raw?.lots, 1, 20, 1),
    maxEntriesPerDay: clampInt(raw?.maxEntriesPerDay, 1, 10, 3),
    greenDayStop: Boolean(raw?.greenDayStop),
  });

  return normalized;
}

export function describeAutoEntryPreference(
  pref: AutoEntryPreferenceState,
): string[] {
  const lines: string[] = [];
  if (pref.signalMode === 'engine') {
    lines.push(
      `Default engine — enter when PA conviction ≥ ${pref.entryThreshold}% (full conviction gates).`,
    );
    if (pref.ignoreChartVeto) {
      lines.push(
        'Chart veto ignored — entries may fire while PA veto is active (conviction + tradeable action still required).',
      );
    }
  } else {
    lines.push(`Fast entry preset: ${pref.signalProfile} (component filters on 5m/15m/1h).`);
  }
  lines.push(`Order size: ${pref.lots} lot(s) per auto-entry.`);
  if (pref.dryRun) {
    lines.push(
      'Dry-run on — paper entries only (ATM leg resolved, no broker order). Daily cap not enforced.',
    );
  } else if (pref.armedLive) {
    lines.push('Live armed — confirmed signals place real MARKET buy orders.');
  } else {
    lines.push(
      'Live disarmed — signals are watched; arm live orders to send MARKET buys.',
    );
  }
  lines.push(`Daily cap: up to ${pref.maxEntriesPerDay} live auto-entries per session day.`);
  if (pref.greenDayStop) {
    lines.push(
      `Green-day stop: no further entries after any watched trade closes ≥${BENCHMARK_GREEN_DAY_STOP_MIN_R}R.`,
    );
  }
  return lines;
}

export async function loadAutoEntryPreference(
  fastify: FastifyInstance,
  memoryState: AutoEntryPreferenceState = DEFAULT_AUTO_ENTRY,
): Promise<AutoEntryPreferenceState> {
  const col = fastify.mongo?.db?.collection<
    AutoEntryPreferenceState & { key: string }
  >(SESSION_STATE_COLLECTION);
  if (!col) return memoryState;

  const doc = await col.findOne({ key: AUTO_ENTRY_PREFERENCE_KEY });
  if (!doc) return memoryState;
  return normalizeAutoEntryPreference(doc, undefined);
}

export async function saveAutoEntryPreference(
  fastify: FastifyInstance,
  patch: Partial<AutoEntryPreferenceState>,
  memoryState: AutoEntryPreferenceState,
): Promise<AutoEntryPreferenceState> {
  const merged = { ...memoryState, ...patch };
  if (patch.dryRun === true) {
    merged.armedLive = false;
    merged.armedLiveSessionDate = null;
  }
  if (patch.armedLive === true && !merged.dryRun) {
    merged.armedLiveSessionDate = istSessionDate();
  }
  if (patch.armedLive === false) {
    merged.armedLiveSessionDate = null;
  }

  const next = normalizeAutoEntryPreference(merged, undefined);

  const col = fastify.mongo?.db?.collection<
    AutoEntryPreferenceState & { key: string }
  >(SESSION_STATE_COLLECTION);
  if (col) {
    await col.updateOne(
      { key: AUTO_ENTRY_PREFERENCE_KEY },
      { $set: { key: AUTO_ENTRY_PREFERENCE_KEY, ...next } },
      { upsert: true },
    );
  }

  return next;
}