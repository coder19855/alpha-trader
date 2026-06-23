import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  OPTION_CHAIN_POLL_DEFAULT_MS,
  OPTION_CHAIN_POLL_PRESETS,
  TradingStyle,
  VetoMode,
  normalizeOptionChainPollMs,
  normalizeVetoMode,
} from '@alpha-trader/server-shared';
import {
  AUTO_EXIT_PREFERENCE_KEY,
  SESSION_STATE_COLLECTION,
  SETTINGS_PREFERENCE_KEY,
} from './session-state.js';

export interface SettingsOption {
  value: string;
  label: string;
  hint?: string;
}

export interface SettingsGroup {
  id: string;
  title: string;
  description?: string;
  control: 'segmented' | 'toggle' | 'select';
  field: keyof SettingsPatch;
  options?: SettingsOption[];
}

export interface SettingsSnapshot {
  vetoMode: VetoMode;
  tradingStyle: TradingStyle;
  optionChainPollMs: number;
  flowMode: 'pa-only';
  canPersist: boolean;
  groups: SettingsGroup[];
}

export type SettingsPatch = {
  vetoMode?: string;
  tradingStyle?: string;
  optionChainPollMs?: string | number;
};

export interface StoredSettings {
  vetoMode: VetoMode;
  tradingStyle: TradingStyle;
  optionChainPollMs: number;
}

const DEFAULT_SETTINGS: StoredSettings = {
  vetoMode: 'strict',
  tradingStyle: TradingStyle.Intraday,
  optionChainPollMs: OPTION_CHAIN_POLL_DEFAULT_MS,
};

function normalizeTradingStyle(value: unknown): TradingStyle {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'SCALPER' || raw === TradingStyle.Scalper) {
    return TradingStyle.Scalper;
  }
  if (raw === 'POSITIONAL' || raw === TradingStyle.Positional) {
    return TradingStyle.Positional;
  }
  return TradingStyle.Intraday;
}

export function settingsGroups(): SettingsGroup[] {
  return [
    {
      id: 'trading-style',
      title: 'Trading style',
      description: 'Primary timeframe bias for signals and deck.',
      control: 'segmented',
      field: 'tradingStyle',
      options: [
        { value: 'INTRADAY', label: 'Intraday', hint: '15m' },
        { value: 'SCALPER', label: 'Scalper', hint: '5m' },
        { value: 'POSITIONAL', label: 'Positional', hint: '1h' },
      ],
    },
    {
      id: 'veto-mode',
      title: 'Chart veto',
      description: 'How strictly chart structure blocks entries.',
      control: 'segmented',
      field: 'vetoMode',
      options: [
        { value: 'strict', label: 'Strict' },
        { value: 'relaxed', label: 'Relaxed' },
        { value: 'off', label: 'Off' },
      ],
    },
    {
      id: 'option-chain-poll',
      title: 'Option chain refresh',
      description:
        'How often the server refreshes option chain data. Manual refresh always works.',
      control: 'segmented',
      field: 'optionChainPollMs',
      options: OPTION_CHAIN_POLL_PRESETS.map((p) => ({
        value: String(p.value),
        label: p.label,
      })),
    },
  ];
}

export function buildSettingsSnapshot(
  stored: StoredSettings,
  canPersist: boolean,
): SettingsSnapshot {
  return {
    vetoMode: stored.vetoMode,
    tradingStyle: stored.tradingStyle,
    optionChainPollMs: stored.optionChainPollMs,
    flowMode: 'pa-only',
    canPersist,
    groups: settingsGroups(),
  };
}

export async function loadSettings(
  fastify: FastifyInstance,
  memoryState: StoredSettings = DEFAULT_SETTINGS,
): Promise<StoredSettings> {
  const col = fastify.mongo?.db?.collection<
    StoredSettings & { key: string }
  >(SESSION_STATE_COLLECTION);
  if (!col) return memoryState;

  const doc = await col.findOne({ key: SETTINGS_PREFERENCE_KEY });
  if (!doc) return memoryState;

  return {
    vetoMode: normalizeVetoMode(doc.vetoMode, DEFAULT_SETTINGS.vetoMode),
    tradingStyle: normalizeTradingStyle(doc.tradingStyle),
    optionChainPollMs: normalizeOptionChainPollMs(
      doc.optionChainPollMs ?? DEFAULT_SETTINGS.optionChainPollMs,
    ),
  };
}

export async function saveSettings(
  fastify: FastifyInstance,
  patch: SettingsPatch,
  memoryState: StoredSettings,
): Promise<StoredSettings> {
  const next: StoredSettings = { ...memoryState };
  if (patch.vetoMode != null) {
    next.vetoMode = normalizeVetoMode(patch.vetoMode, next.vetoMode);
  }
  if (patch.tradingStyle != null) {
    next.tradingStyle = normalizeTradingStyle(patch.tradingStyle);
  }
  if (patch.optionChainPollMs != null) {
    next.optionChainPollMs = normalizeOptionChainPollMs(patch.optionChainPollMs);
  }

  const col = fastify.mongo?.db?.collection<
    StoredSettings & { key: string }
  >(SESSION_STATE_COLLECTION);
  if (col) {
    await col.updateOne(
      { key: SETTINGS_PREFERENCE_KEY },
      { $set: { key: SETTINGS_PREFERENCE_KEY, ...next } },
      { upsert: true },
    );
  }

  return next;
}

export { AUTO_EXIT_PREFERENCE_KEY };