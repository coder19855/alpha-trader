import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  AutoExitPreferenceState,
  loadAutoExitPreference,
  normalizeAutoExitPreference,
  saveAutoExitPreference,
} from './auto-exit-preference.js';
import {
  AutoEntryPreferenceState,
  loadAutoEntryPreference,
  normalizeAutoEntryPreference,
  saveAutoEntryPreference,
} from './auto-entry-preference.js';
import { TradingStyle } from '@alpha-trader/server-shared';
import {
  SettingsPatch,
  StoredSettings,
  loadSettings,
  saveSettings,
} from './settings.js';

export interface PreferencesService {
  getSettings(): StoredSettings;
  getAutoExit(): AutoExitPreferenceState;
  getAutoEntry(): AutoEntryPreferenceState;
  canPersist(): boolean;
  refresh(): Promise<void>;
  patchSettings(patch: SettingsPatch): Promise<StoredSettings>;
  patchAutoExit(
    patch: Partial<AutoExitPreferenceState>,
  ): Promise<AutoExitPreferenceState>;
  patchAutoEntry(
    patch: Partial<AutoEntryPreferenceState>,
  ): Promise<AutoEntryPreferenceState>;
}

const preferencesPlugin = fp(
  async (fastify: FastifyInstance) => {
    let settings: StoredSettings = {
      vetoMode: 'strict',
      tradingStyle: TradingStyle.Intraday,
    };
    let autoExit = normalizeAutoExitPreference(null);
    let autoEntry = normalizeAutoEntryPreference(null);

    const service: PreferencesService = {
      getSettings: () => settings,
      getAutoExit: () => autoExit,
      getAutoEntry: () => autoEntry,
      canPersist: () => Boolean(fastify.mongo?.db),
      refresh: async () => {
        settings = await loadSettings(fastify, settings);
        autoExit = await loadAutoExitPreference(fastify, autoExit);
        autoEntry = await loadAutoEntryPreference(fastify, autoEntry);
      },
      patchSettings: async (patch) => {
        settings = await saveSettings(fastify, patch, settings);
        return settings;
      },
      patchAutoExit: async (patch) => {
        autoExit = await saveAutoExitPreference(fastify, patch, autoExit);
        return autoExit;
      },
      patchAutoEntry: async (patch) => {
        autoEntry = await saveAutoEntryPreference(fastify, patch, autoEntry);
        return autoEntry;
      },
    };

    fastify.decorate('preferences', service);
    await service.refresh();
  },
  { name: 'preferences', dependencies: ['mongodb'] },
);

export async function registerPreferencesPlugin(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(preferencesPlugin);
}