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
  buildAutoExitPolicyOptions,
  buildAutoExitPositionOptions,
  buildExitModeHints,
  buildPositionModeHints,
  describeExitPolicyDetail,
  describePositionModeDetail,
} from './lib/benchmark-policy-hints.js';
export { buildWebAppSession, type WebAppSessionPayload } from './lib/web-session.js';