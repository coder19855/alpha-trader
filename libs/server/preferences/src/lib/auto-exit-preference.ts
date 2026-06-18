import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  BENCHMARK_EXIT_MATRIX_PRESETS,
  BenchmarkExitPolicy,
} from '@alpha-trader/server-analysis';
import { BenchmarkPositionPolicy } from '@alpha-trader/server-position';
import {
  AUTO_EXIT_PREFERENCE_KEY,
  SESSION_STATE_COLLECTION,
} from './session-state.js';

export interface AutoExitPreferenceState {
  enabled: boolean;
  retestCount: number;
  signalFlipExit: boolean;
  exitPolicy: BenchmarkExitPolicy;
  positionPolicy: BenchmarkPositionPolicy;
}

const DEFAULT_AUTO_EXIT: AutoExitPreferenceState = {
  enabled: false,
  retestCount: 2,
  signalFlipExit: true,
  exitPolicy: 'rr-ladder',
  positionPolicy: 'flat',
};

function normalizeRetestCount(value: unknown): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return DEFAULT_AUTO_EXIT.retestCount;
  return Math.max(0, Math.min(5, n));
}

function normalizeExitPolicy(value: unknown): BenchmarkExitPolicy {
  const token = String(value ?? '').trim() as BenchmarkExitPolicy;
  if (BENCHMARK_EXIT_MATRIX_PRESETS.includes(token)) return token;
  return DEFAULT_AUTO_EXIT.exitPolicy;
}

function normalizePositionPolicy(value: unknown): BenchmarkPositionPolicy {
  const token = String(value ?? '').trim();
  if (token === 'scale-ladder') return 'scale-ladder';
  return 'flat';
}

export function normalizeAutoExitPreference(
  raw?: Partial<AutoExitPreferenceState> | null,
): AutoExitPreferenceState {
  return {
    enabled: Boolean(raw?.enabled),
    retestCount: normalizeRetestCount(raw?.retestCount),
    signalFlipExit: raw?.signalFlipExit !== false,
    exitPolicy: normalizeExitPolicy(raw?.exitPolicy),
    positionPolicy: normalizePositionPolicy(raw?.positionPolicy),
  };
}

export async function loadAutoExitPreference(
  fastify: FastifyInstance,
  memoryState: AutoExitPreferenceState = DEFAULT_AUTO_EXIT,
): Promise<AutoExitPreferenceState> {
  const col = fastify.mongo?.db?.collection<
    AutoExitPreferenceState & { key: string }
  >(SESSION_STATE_COLLECTION);
  if (!col) return memoryState;

  const doc = await col.findOne({ key: AUTO_EXIT_PREFERENCE_KEY });
  if (!doc) return memoryState;
  return normalizeAutoExitPreference(doc);
}

export async function saveAutoExitPreference(
  fastify: FastifyInstance,
  patch: Partial<AutoExitPreferenceState>,
  memoryState: AutoExitPreferenceState,
): Promise<AutoExitPreferenceState> {
  const next = normalizeAutoExitPreference({ ...memoryState, ...patch });

  const col = fastify.mongo?.db?.collection<
    AutoExitPreferenceState & { key: string }
  >(SESSION_STATE_COLLECTION);
  if (col) {
    await col.updateOne(
      { key: AUTO_EXIT_PREFERENCE_KEY },
      { $set: { key: AUTO_EXIT_PREFERENCE_KEY, ...next } },
      { upsert: true },
    );
  }

  return next;
}