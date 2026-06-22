export { registerPreferencesPlugin } from './lib/register-preferences-plugin.js';
export type { PreferencesService } from './lib/register-preferences-plugin.js';
export {
  buildSettingsSnapshot,
  settingsGroups,
  type SettingsSnapshot,
  type SettingsPatch,
  type StoredSettings,
} from './lib/settings.js';
export {
  normalizeAutoExitPreference,
  loadAutoExitPreference,
  saveAutoExitPreference,
  type AutoExitPreferenceState,
} from './lib/auto-exit-preference.js';
export {
  normalizeAutoEntryPreference,
  loadAutoEntryPreference,
  saveAutoEntryPreference,
  type AutoEntryPreferenceState,
} from './lib/auto-entry-preference.js';
export {
  listTradeJournal,
  recordJournalOpen,
  recordJournalClose,
  patchJournalOptionTrigger,
  syncTradeJournalFromPositions,
  TRADE_JOURNAL_COLLECTION,
  type TradeJournalEntry,
  type TradeJournalUpsertInput,
} from './lib/trade-journal.js';
export {
  buildAutoExitPolicyOptions,
  buildAutoExitPositionOptions,
  buildExitModeHints,
  buildPositionModeHints,
  describeExitPolicyDetail,
  describePositionModeDetail,
} from './lib/benchmark-policy-hints.js';
export { buildWebAppSession, type WebAppSessionPayload } from './lib/web-session.js';