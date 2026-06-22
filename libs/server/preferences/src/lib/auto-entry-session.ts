import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { BENCHMARK_GREEN_DAY_STOP_MIN_R } from '@alpha-trader/server-shared';
import { AutoEntryPreferenceState } from './auto-entry-preference.js';
import {
  AUTO_ENTRY_SESSION_KEY,
  SESSION_STATE_COLLECTION,
} from './session-state.js';

export interface AutoEntrySessionState {
  sessionDate: string;
  entriesToday: number;
  dryRunsToday: number;
  greenDayLocked: boolean;
  lastEntryAt?: string | null;
  lastDryRunAt?: string | null;
}

function istSessionDate(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function createAutoEntrySessionState(
  now = new Date(),
): AutoEntrySessionState {
  return {
    sessionDate: istSessionDate(now),
    entriesToday: 0,
    dryRunsToday: 0,
    greenDayLocked: false,
    lastEntryAt: null,
    lastDryRunAt: null,
  };
}

function rolloverIfNeeded(
  state: AutoEntrySessionState,
  now = new Date(),
): AutoEntrySessionState {
  const today = istSessionDate(now);
  if (state.sessionDate === today) return state;
  return createAutoEntrySessionState(now);
}

export async function loadAutoEntrySession(
  fastify: FastifyInstance,
): Promise<AutoEntrySessionState> {
  const col = fastify.mongo?.db?.collection<
    AutoEntrySessionState & { key: string }
  >(SESSION_STATE_COLLECTION);
  const fresh = createAutoEntrySessionState();
  if (!col) return fresh;

  const doc = await col.findOne({ key: AUTO_ENTRY_SESSION_KEY });
  if (!doc) return fresh;
  return rolloverIfNeeded({
    sessionDate: doc.sessionDate,
    entriesToday: doc.entriesToday ?? 0,
    dryRunsToday: doc.dryRunsToday ?? 0,
    greenDayLocked: Boolean(doc.greenDayLocked),
    lastEntryAt: doc.lastEntryAt ?? null,
    lastDryRunAt: doc.lastDryRunAt ?? null,
  });
}

async function saveAutoEntrySession(
  fastify: FastifyInstance,
  state: AutoEntrySessionState,
): Promise<void> {
  const col = fastify.mongo?.db?.collection<
    AutoEntrySessionState & { key: string }
  >(SESSION_STATE_COLLECTION);
  if (!col) return;
  await col.updateOne(
    { key: AUTO_ENTRY_SESSION_KEY },
    { $set: { key: AUTO_ENTRY_SESSION_KEY, ...state } },
    { upsert: true },
  );
}

export function canAutoEntryToday(
  pref: AutoEntryPreferenceState,
  session: AutoEntrySessionState,
): { allowed: boolean; reason?: string } {
  if (pref.dryRun) {
    return { allowed: true };
  }
  if (pref.greenDayStop && session.greenDayLocked) {
    return {
      allowed: false,
      reason: `Green-day stop active — a trade already closed ≥${BENCHMARK_GREEN_DAY_STOP_MIN_R}R today.`,
    };
  }
  if (session.entriesToday >= pref.maxEntriesPerDay) {
    return {
      allowed: false,
      reason: `Daily cap reached (${pref.maxEntriesPerDay} entries).`,
    };
  }
  return { allowed: true };
}

export async function recordAutoEntryDryRun(
  fastify: FastifyInstance,
): Promise<AutoEntrySessionState> {
  const state = rolloverIfNeeded(await loadAutoEntrySession(fastify));
  const next: AutoEntrySessionState = {
    ...state,
    dryRunsToday: state.dryRunsToday + 1,
    lastDryRunAt: new Date().toISOString(),
  };
  await saveAutoEntrySession(fastify, next);
  return next;
}

export async function recordAutoEntryPlaced(
  fastify: FastifyInstance,
): Promise<AutoEntrySessionState> {
  const state = rolloverIfNeeded(await loadAutoEntrySession(fastify));
  const next: AutoEntrySessionState = {
    ...state,
    entriesToday: state.entriesToday + 1,
    lastEntryAt: new Date().toISOString(),
  };
  await saveAutoEntrySession(fastify, next);
  return next;
}

export async function recordAutoEntryTradeClosed(
  fastify: FastifyInstance,
  tradePnlR: number,
  greenDayStop: boolean,
): Promise<AutoEntrySessionState> {
  const state = rolloverIfNeeded(await loadAutoEntrySession(fastify));
  const next: AutoEntrySessionState = { ...state };
  if (greenDayStop && tradePnlR >= BENCHMARK_GREEN_DAY_STOP_MIN_R) {
    next.greenDayLocked = true;
  }
  await saveAutoEntrySession(fastify, next);
  return next;
}

const lastKnownPositionR = new Map<string, number>();
const hadOpenBySymbol = new Map<string, boolean>();

export function noteAutoEntryPositionR(
  indexSymbol: string,
  currentR: number | null | undefined,
): void {
  if (currentR == null || !Number.isFinite(currentR)) return;
  lastKnownPositionR.set(indexSymbol.trim(), currentR);
}

export function consumeAutoEntryCloseR(indexSymbol: string): number | null {
  const key = indexSymbol.trim();
  const r = lastKnownPositionR.get(key);
  lastKnownPositionR.delete(key);
  return r ?? null;
}

export function trackAutoEntryPositionPresence(
  indexSymbol: string,
  hasOpen: boolean,
): { justClosed: boolean } {
  const key = indexSymbol.trim();
  const wasOpen = hadOpenBySymbol.get(key) ?? false;
  hadOpenBySymbol.set(key, hasOpen);
  return { justClosed: wasOpen && !hasOpen };
}