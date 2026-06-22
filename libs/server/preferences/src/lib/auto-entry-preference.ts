import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  AUTO_ENTRY_PREFERENCE_KEY,
  SESSION_STATE_COLLECTION,
} from './session-state.js';

export interface AutoEntryPreferenceState {
  enabled: boolean;
  signalProfile: string;
}

const DEFAULT_AUTO_ENTRY: AutoEntryPreferenceState = {
  enabled: false,
  signalProfile: 'engine',
};

export function normalizeAutoEntryPreference(
  raw?: Partial<AutoEntryPreferenceState> | null,
  allowedProfiles?: Set<string>,
): AutoEntryPreferenceState {
  const token = String(raw?.signalProfile ?? '').trim();
  let signalProfile = DEFAULT_AUTO_ENTRY.signalProfile;
  if (token) {
    signalProfile =
      allowedProfiles && !allowedProfiles.has(token) ? signalProfile : token;
  }
  return {
    enabled: Boolean(raw?.enabled),
    signalProfile,
  };
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
  const next = normalizeAutoEntryPreference(
    { ...memoryState, ...patch },
    undefined,
  );

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