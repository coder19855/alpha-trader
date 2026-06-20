import {
  BENCHMARK_EXIT_MATRIX_PRESETS,
  BenchmarkExitPolicy,
  describeExitPolicy,
} from '@alpha-trader/server-analysis';
import {
  BENCHMARK_POSITION_MATRIX_PRESETS,
  BenchmarkPositionPolicy,
  describePositionPolicy,
} from '@alpha-trader/server-position';
import {
  buildAutoExitPolicyOptions,
  buildAutoExitPositionOptions,
  buildExitModeHints,
  buildPositionModeHints,
  describeExitPolicyDetail,
  describePositionModeDetail,
} from '@alpha-trader/server-preferences';
import {
  BENCHMARK_DAILY_LOSS_CAP_R,
  BENCHMARK_JOB_MIN_MS,
  BENCHMARK_JOB_MS_PER_REPLAY_BASE,
  BENCHMARK_JOB_OVERHEAD_MS,
  FYERS_OPTION_INDEX_SYMBOLS,
  TradingStyle,
  resolveBenchmarkJobMaxCapMs,
} from '@alpha-trader/server-shared';
import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { clampBenchmarkDays } from './benchmark-window.js';
import {
  BENCHMARK_SIGNAL_PRESETS,
  buildSignalPresetGroupsResponse,
  describeProfileGates,
} from './signal-profile.js';
import {
  BenchmarkAiMode,
  BenchmarkParams,
  BenchmarkPnlModel,
} from './types.js';

const MAX_REPLAYS_WITHOUT_CONFIRM = 20;

export interface BenchmarkWebConfig extends BenchmarkParams {
  confirmLargeRun?: boolean;
}

export interface BenchmarkReplayCountable {
  signalMatrix?: string[];
  exitMatrix?: BenchmarkExitPolicy[];
  positionMatrix?: BenchmarkPositionPolicy[];
}

export interface BenchmarkOptionsResponse {
  symbols: Array<{ symbol: string; label: string; shortName: string }>;
  tradingStyles: Array<{ id: TradingStyle; label: string }>;
  aiModes: Array<{ id: BenchmarkAiMode; label: string }>;
  pnlModels: Array<{ id: BenchmarkPnlModel; label: string }>;
  flowModes: Array<{ id: string; label: string }>;
  exitPolicies: ReturnType<typeof buildAutoExitPolicyOptions>;
  positionPolicies: ReturnType<typeof buildAutoExitPositionOptions>;
  exitModeHints: ReturnType<typeof buildExitModeHints>;
  positionModeHints: ReturnType<typeof buildPositionModeHints>;
  signalPresets: Array<{ id: string; label: string; gates: string[] }>;
  signalPresetGroups: ReturnType<typeof buildSignalPresetGroupsResponse>;
  defaults: BenchmarkParams & { signalProfile?: string };
  limits: {
    minDays: number;
    maxDays: number;
    maxTradesPerDay: number;
    maxReplaysWithoutConfirm: number;
  };
  notes: {
    simulation: string;
    optionFlow: string;
  };
}

export function buildBenchmarkOptionsResponse(
  fastify: FastifyInstance,
  query: { symbol: string; style: TradingStyle },
): BenchmarkOptionsResponse {
  const settings = fastify.preferences.getSettings();
  const autoExit = fastify.preferences.getAutoExit();

  return {
    symbols: FYERS_OPTION_INDEX_SYMBOLS.map((row) => ({
      symbol: row.symbol,
      label: row.label,
      shortName: row.shortName,
    })),
    tradingStyles: [
      { id: TradingStyle.Intraday, label: 'Intraday' },
      { id: TradingStyle.Scalper, label: 'Scalper' },
      { id: TradingStyle.Positional, label: 'Positional' },
    ],
    aiModes: [
      { id: 'off' as BenchmarkAiMode, label: 'Off (PA-only)' },
      { id: 'shadow' as BenchmarkAiMode, label: 'Shadow (stub)' },
    ],
    pnlModels: [
      { id: 'index' as BenchmarkPnlModel, label: 'Index R-multiples' },
      {
        id: 'synthetic_weekly_option' as BenchmarkPnlModel,
        label: 'Weekly option sim (1 lot)',
      },
    ],
    flowModes: [{ id: 'pa-only', label: 'Price action only' }],
    exitPolicies: buildAutoExitPolicyOptions(),
    positionPolicies: buildAutoExitPositionOptions(),
    exitModeHints: buildExitModeHints(),
    positionModeHints: buildPositionModeHints(),
    signalPresets: Object.values(BENCHMARK_SIGNAL_PRESETS).map((preset) => ({
      id: preset.id,
      label: preset.label,
      gates: describeProfileGates(preset),
    })),
    signalPresetGroups: buildSignalPresetGroupsResponse(),
    defaults: {
      symbol: query.symbol,
      tradingStyle: query.style,
      days: 14,
      aiMode: 'off' as const,
      pnlModel: 'index' as BenchmarkPnlModel,
      vetoMode: settings.vetoMode,
      exitPolicy: autoExit.exitPolicy,
      positionPolicy: autoExit.positionPolicy,
      flowMode: 'pa-only' as const,
      chaseDecay: false,
      greenDayStop: false,
      avoidFirst5Min: false,
      avoidTightRange: false,
      dailyLossCapR: BENCHMARK_DAILY_LOSS_CAP_R,
      signalProfile: 'engine',
    },
    limits: {
      minDays: 3,
      maxDays: 90,
      maxTradesPerDay: 20,
      maxReplaysWithoutConfirm: MAX_REPLAYS_WITHOUT_CONFIRM,
    },
    notes: {
      simulation:
        'PA-only benchmark replays timeline signals with configurable exit/position policies.',
      optionFlow: 'Option flow lane disabled in alpha-trader (PA-only).',
    },
  };
}

export { clampBenchmarkDays } from './benchmark-window.js';

export function countBenchmarkReplays(config: BenchmarkReplayCountable): number {
  if (config.signalMatrix?.length) return config.signalMatrix.length;
  if (config.exitMatrix?.length) return config.exitMatrix.length;
  if (config.positionMatrix?.length) return config.positionMatrix.length;
  return 1;
}

export function estimateBenchmarkJobMaxMs(
  config: BenchmarkReplayCountable & {
    days?: number;
    aiMode?: BenchmarkAiMode;
  },
): number {
  const replays = countBenchmarkReplays(config);
  const days = Math.max(3, Math.min(90, config.days ?? 14));
  const aiMode = config.aiMode ?? 'off';
  const dayFactor = days / 14;
  const aiFactor = aiMode === 'off' ? 0.8 : aiMode === 'active' ? 1.5 : 1;
  const estimated =
    replays * BENCHMARK_JOB_MS_PER_REPLAY_BASE * dayFactor * aiFactor +
    BENCHMARK_JOB_OVERHEAD_MS;
  const cap = resolveBenchmarkJobMaxCapMs();
  return Math.min(cap, Math.max(BENCHMARK_JOB_MIN_MS, Math.round(estimated)));
}

function readBool(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  return value === true || value === 'true' || value === '1' || value === 1;
}

function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === 'string');
  return items.length ? items : undefined;
}

export function normalizeWebConfigInput(
  body: Record<string, unknown>,
  fallback: BenchmarkParams,
): BenchmarkParams {
  const days = clampBenchmarkDays(body.days ?? fallback.days ?? 14);
  const styleRaw = String(body.tradingStyle ?? fallback.tradingStyle).toUpperCase();
  const tradingStyle =
    styleRaw === TradingStyle.Scalper
      ? TradingStyle.Scalper
      : styleRaw === TradingStyle.Positional
        ? TradingStyle.Positional
        : TradingStyle.Intraday;

  const aiRaw = body.aiMode;
  const aiMode: BenchmarkAiMode =
    aiRaw === 'off' || aiRaw === 'shadow' || aiRaw === 'active'
      ? aiRaw
      : (fallback.aiMode ?? 'off');

  const pnlRaw = body.pnlModel;
  const pnlModel: BenchmarkPnlModel =
    pnlRaw === 'synthetic_weekly_option' || pnlRaw === 'index'
      ? pnlRaw
      : (fallback.pnlModel ?? 'index');

  const exitMatrix = readStringList(body.exitMatrix) as
    | BenchmarkExitPolicy[]
    | undefined;
  const positionMatrix = readStringList(body.positionMatrix) as
    | BenchmarkPositionPolicy[]
    | undefined;
  const signalMatrix = readStringList(body.signalMatrix);

  const exitPolicy =
    exitMatrix?.length
      ? undefined
      : ((body.exitPolicy as BenchmarkExitPolicy) ?? fallback.exitPolicy);
  const positionPolicy =
    positionMatrix?.length
      ? undefined
      : ((body.positionPolicy as BenchmarkPositionPolicy) ??
        fallback.positionPolicy);

  return {
    symbol:
      typeof body.symbol === 'string' && body.symbol.trim()
        ? body.symbol.trim()
        : fallback.symbol,
    tradingStyle,
    days,
    aiMode,
    vetoMode: fallback.vetoMode,
    flowMode: 'pa-only',
    maxTradesPerDay:
      body.maxTradesPerDay !== undefined && body.maxTradesPerDay !== ''
        ? Math.max(1, Number(body.maxTradesPerDay))
        : undefined,
    pnlModel,
    chaseDecay: readBool(body, 'chaseDecay') || undefined,
    greenDayStop: readBool(body, 'greenDayStop') || undefined,
    avoidFirst5Min: readBool(body, 'avoidFirst5Min') || undefined,
    avoidTightRange: readBool(body, 'avoidTightRange') || undefined,
    requireRetest: readBool(body, 'requireRetest') || undefined,
    dailyLossCapR:
      typeof body.dailyLossCapR === 'number'
        ? body.dailyLossCapR
        : readBool(body, 'sessionRules')
          ? BENCHMARK_DAILY_LOSS_CAP_R
          : undefined,
    exitPolicy,
    exitMatrix: exitMatrix?.length ? exitMatrix : undefined,
    positionPolicy,
    positionMatrix: positionMatrix?.length ? positionMatrix : undefined,
    signalMatrix: signalMatrix?.length ? signalMatrix : undefined,
    signalProfile:
      typeof body.signalProfile === 'string' && body.signalProfile.trim()
        ? body.signalProfile.trim()
        : signalMatrix?.length
          ? undefined
          : fallback.signalProfile,
    windowStartDate:
      typeof body.windowStartDate === 'string'
        ? body.windowStartDate
        : undefined,
    windowEndDate:
      typeof body.windowEndDate === 'string' ? body.windowEndDate : undefined,
  };
}

export function resolveBenchmarkWebConfigDefaults(
  fastify: FastifyInstance,
  symbol: string,
  tradingStyle: TradingStyle,
): BenchmarkParams {
  const settings = fastify.preferences.getSettings();
  const autoExit = fastify.preferences.getAutoExit();
  return {
    symbol,
    tradingStyle,
    days: 14,
    aiMode: 'off',
    vetoMode: settings.vetoMode,
    pnlModel: 'index',
    flowMode: 'pa-only',
    exitPolicy: autoExit.exitPolicy,
    positionPolicy: autoExit.positionPolicy,
    chaseDecay: false,
    greenDayStop: false,
    avoidFirst5Min: false,
    avoidTightRange: false,
    requireRetest: false,
    dailyLossCapR: BENCHMARK_DAILY_LOSS_CAP_R,
    signalProfile: 'engine',
  };
}

export function describeBenchmarkMatrixPresets() {
  return {
    exitPolicies: BENCHMARK_EXIT_MATRIX_PRESETS.map((id) => ({
      id,
      label: describeExitPolicy(id),
      hint: describeExitPolicyDetail(id),
    })),
    positionPolicies: BENCHMARK_POSITION_MATRIX_PRESETS.map((id) => ({
      id,
      label: describePositionPolicy(id),
      hint: describePositionModeDetail(
        id === 'scale-ladder' ? 'scale-ladder' : 'flat',
      ),
    })),
  };
}