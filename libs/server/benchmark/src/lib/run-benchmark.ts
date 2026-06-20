import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  BENCHMARK_FETCH_LOOKBACK_DAYS,
  BENCHMARK_REPLAY_PROGRESS_EVERY,
  BENCHMARK_SNAPSHOT_MAX_BARS,
  resolveBenchmarkFlipPollMinutes,
  resolveBenchmarkSignalIntervalMinutes,
} from '@alpha-trader/server-shared';
import { SESSION_TRADE_COOLDOWN_MINUTES, TIMELINE_DEFAULTS } from '@alpha-trader/server-shared';
import { getStyleScoringConfig } from '@alpha-trader/server-shared';
import { buildPriceActionSnapshot } from '@alpha-trader/server-analysis';
import {
  advanceCandleEndIndex,
  buildTimelineAnchors,
  buildTradeSetup,
  getIstSessionKey,
  parseEpochMs,
  resolveSimulationUntilSec,
  sliceCandlesAfter,
  toIso,
  getNseSessionOpenSec,
} from '@alpha-trader/server-analysis';
import { resolveBenchmarkWindowInput } from './benchmark-window.js';
import { OptionChainSnapshotRecord } from './benchmark-stubs.js';
import { PriceActionResponse, TradeAction } from '@alpha-trader/server-shared';
import { TradingStyle } from '@alpha-trader/server-shared';
import { neutralOptionMetrics } from './snapshot-to-option.js';
import { describeExitPolicy } from '@alpha-trader/server-analysis';
import { describePositionPolicy } from '@alpha-trader/server-position';
import { runPositionPolicyMatrix } from './run-position-policy-matrix.js';
import { buildFlipExitSignals, BenchmarkAnchorRead } from './flip-exit-utils.js';
import {
  simulateTradeOutcomeWithTrailingFloor,
} from './trailing-tp-simulator.js';
import {
  BenchmarkAiMode,
  BenchmarkFilterStats,
  BenchmarkParams,
  BenchmarkReport,
  BenchmarkTradeRow,
} from './types.js';
import { buildAiVerdictSummary, buildEngineVerdict } from './verdict.js';
import {
  buildAiComparison,
  buildEquityCurve,
} from './summarize.js';
import {
  BENCHMARK_STOP_LOSS_NOTE,
  buildCapitalProjection,
} from './capital-curve.js';
import {
  simulateSyntheticWeeklyOption,
  SYNTHETIC_WEEKLY_OPTION_NOTE,
} from './synthetic-weekly-option.js';
import { buildBenchmarkTradeSetup } from './benchmark-trade-setup.js';
import { BENCHMARK_DEFAULT_STARTING_CAPITAL_INR } from '@alpha-trader/server-shared';
import { fetchFyersHistoryCandles } from '@alpha-trader/server-market-data';
import {
  beginBenchmarkReplay,
  endBenchmarkReplay,
} from './benchmark-runtime.js';
import { yieldToEventLoop } from '@alpha-trader/server-shared';
import { buildProgressUpdate } from './benchmark-job-store.js';
import {
  applyBenchmarkTradeToSessionDay,
  createBenchmarkSessionDayState,
  describeBenchmarkSessionDayPolicy,
  isBenchmarkSessionDayBlocked,
} from './session-day-policy.js';
import { CHASE_DECAY_BENCHMARK_NOTE } from '@alpha-trader/server-analysis';
import {
  formatNoTradeWindows,
  isWithinNoTradeWindow,
} from '@alpha-trader/server-analysis';
import { formatBenchmarkElapsed } from './benchmark-timer.js';
import { SnapshotDeps } from '@alpha-trader/server-analysis';
import { FlowMode, isPaOnlyFlow } from '@alpha-trader/server-shared';
import { VetoMode } from '@alpha-trader/server-shared';
import { FyersAPI } from 'fyers-api-v3';
import {
  evaluateSignalProfile,
  profileNeedsChartPatterns,
  resolveSignalProfile,
} from './signal-profile.js';
import { runBenchmarkMatrix } from './run-benchmark-matrix.js';
import { runExitStrategyMatrix } from './run-exit-strategy-matrix.js';

function resolveSignalTradeSetup(
  snapshot: NonNullable<ReturnType<typeof buildPriceActionSnapshot>>,
  action: 'CE-BUY' | 'PE-BUY',
) {
  if (snapshot.tradeSetup) return snapshot.tradeSetup;
  const entry = snapshot.lastPrice;
  const primaryTf = snapshot.primaryTimeframe as '5m' | '15m' | '1h';
  const atr = snapshot.atr?.[primaryTf] ?? 0;
  const support = snapshot.levels?.support ?? 0;
  const resistance = snapshot.levels?.resistance ?? 0;
  const rawStop =
    action === 'CE-BUY'
      ? support > 0
        ? support
        : entry - Math.max(atr * 1.5, entry * 0.002)
      : resistance > 0
        ? resistance
        : entry + Math.max(atr * 1.5, entry * 0.002);
  return buildTradeSetup(action, entry, rawStop, atr);
}

function parseTradingStyle(styleQuery?: string): TradingStyle {
  const styleStr = (styleQuery || 'INTRADAY').toUpperCase();
  if (styleStr === 'SCALPER' || styleStr === TradingStyle.Scalper) {
    return TradingStyle.Scalper;
  }
  if (styleStr === 'POSITIONAL' || styleStr === TradingStyle.Positional) {
    return TradingStyle.Positional;
  }
  return TradingStyle.Intraday;
}

async function loadSnapshotsForWindow(
  _fastify: FastifyInstance,
  _symbol: string,
  _tradingStyle: TradingStyle,
  _fromMs: number,
  _toMs: number,
): Promise<OptionChainSnapshotRecord[]> {
  return [];
}

function indexSnapshotsBySession(
  snapshots: OptionChainSnapshotRecord[],
): Map<string, OptionChainSnapshotRecord[]> {
  const map = new Map<string, OptionChainSnapshotRecord[]>();
  for (const snap of snapshots) {
    const key = getIstSessionKey(Math.floor(snap.bucketAt.getTime() / 1000));
    const bucket = map.get(key);
    if (bucket) bucket.push(snap);
    else map.set(key, [snap]);
  }
  return map;
}

function resolveSnapshotInput(enableChartPatterns: boolean) {
  return {
    maxBars5m: BENCHMARK_SNAPSHOT_MAX_BARS.bars5m,
    maxBars15m: BENCHMARK_SNAPSHOT_MAX_BARS.bars15m,
    maxBars1h: BENCHMARK_SNAPSHOT_MAX_BARS.bars1h,
    benchmarkReplay: !enableChartPatterns,
  };
}

interface ReplayEngineContext {
  fastify: FastifyInstance;
  deps: SnapshotDeps;
  symbol: string;
  activeStyle: TradingStyle;
  vetoMode: VetoMode;
  flowMode: FlowMode;
  chaseDecay: boolean;
  snapshotsBySession: Map<string, OptionChainSnapshotRecord[]>;
  candles5m: FyersAPI.Candle[];
  candles15m: FyersAPI.Candle[];
  candles1h: FyersAPI.Candle[];
  /** Reuse signal-scan decisions for flip-exit polls on the same anchors. */
  engineReadCache: Map<number, BenchmarkAnchorRead>;
  snapshotInput: ReturnType<typeof resolveSnapshotInput>;
}

function cacheEngineRead(
  ctx: ReplayEngineContext,
  read: BenchmarkAnchorRead,
): void {
  ctx.engineReadCache.set(read.asOfMs, read);
}

async function collectEnginePollReads(
  ctx: ReplayEngineContext,
  windowFromMs: number,
  windowUntilMs: number,
  intervalMinutes: number,
  onPollProgress?: (done: number, total: number) => void,
): Promise<BenchmarkAnchorRead[]> {
  const reads: BenchmarkAnchorRead[] = [];
  const anchors = buildTimelineAnchors(
    ctx.candles5m,
    windowFromMs,
    windowUntilMs,
    intervalMinutes,
    true,
  );
  if (!anchors.length) return reads;

  let end5m = -1;
  let end15m = -1;
  let end1h = -1;

  for (let i = 0; i < anchors.length; i++) {
    const asOfMs = anchors[i];
    const cached = ctx.engineReadCache.get(asOfMs);
    if (cached) {
      reads.push(cached);
      if (i === 0 || i === anchors.length - 1 || i % 4 === 0) {
        onPollProgress?.(i + 1, anchors.length);
      }
      continue;
    }

    await yieldToEventLoop();
    const asOfSec = Math.floor(asOfMs / 1000);
    end5m = advanceCandleEndIndex(ctx.candles5m, end5m, asOfSec);
    end15m = advanceCandleEndIndex(ctx.candles15m, end15m, asOfSec);
    end1h = advanceCandleEndIndex(ctx.candles1h, end1h, asOfSec);

    if (end5m + 1 < TIMELINE_DEFAULTS.MIN_CANDLES_FOR_ANALYSIS) continue;

    const snapshot = buildPriceActionSnapshot(ctx.deps, {
      symbol: ctx.symbol,
      tradingStyle: ctx.activeStyle,
      candles5m: ctx.candles5m,
      candles15m: ctx.candles15m,
      candles1h: ctx.candles1h,
      candleEnd5m: end5m,
      candleEnd15m: end15m,
      candleEnd1h: end1h,
      asOfMs,
      ...ctx.snapshotInput,
    });
    if (!snapshot) continue;

    const dayKey = getIstSessionKey(asOfSec);
    const optionData = isPaOnlyFlow(ctx.flowMode)
      ? neutralOptionMetrics(ctx.symbol, snapshot.lastPrice)
      : neutralOptionMetrics(ctx.symbol, snapshot.lastPrice);

    const decision = ctx.fastify.decisionEngine.computeTradeDecision(
      snapshot as PriceActionResponse,
      optionData,
      ctx.activeStyle,
      { vetoMode: ctx.vetoMode, flowMode: ctx.flowMode, chaseDecay: ctx.chaseDecay },
    );

    const read: BenchmarkAnchorRead = {
      asOfMs,
      dayKey,
      action: decision.action,
      conviction: decision.conviction,
    };
    cacheEngineRead(ctx, read);
    reads.push(read);

    if (i === 0 || i === anchors.length - 1 || i % 4 === 0) {
      onPollProgress?.(i + 1, anchors.length);
    }
  }

  return reads;
}

interface TradeCandidate {
  asOfMs: number;
  asOfSec: number;
  dayKey: string;
  action: 'CE-BUY' | 'PE-BUY';
  conviction: number;
  bias: string;
  snapshot: NonNullable<ReturnType<typeof buildPriceActionSnapshot>>;
  optionSource: 'snapshot' | 'neutral_fallback';
  optionData: ReturnType<typeof neutralOptionMetrics>;
  nearestSnap: OptionChainSnapshotRecord | null;
}

export async function runBenchmark(
  fastify: FastifyInstance,
  input: BenchmarkParams,
): Promise<BenchmarkReport> {
  if (input.signalMatrix?.length) {
    beginBenchmarkReplay();
    try {
      return await runBenchmarkMatrix(fastify, {
        ...input,
        signalMatrix: input.signalMatrix,
      });
    } finally {
      endBenchmarkReplay();
    }
  }

  if (input.exitMatrix?.length) {
    beginBenchmarkReplay();
    try {
      return await runExitStrategyMatrix(fastify, {
        ...input,
        exitMatrix: input.exitMatrix,
      });
    } finally {
      endBenchmarkReplay();
    }
  }

  if (input.positionMatrix?.length) {
    beginBenchmarkReplay();
    try {
      return await runPositionPolicyMatrix(fastify, {
        ...input,
        positionMatrix: input.positionMatrix,
      });
    } finally {
      endBenchmarkReplay();
    }
  }

  beginBenchmarkReplay();
  try {
    return await executeBenchmarkReplay(fastify, input);
  } finally {
    endBenchmarkReplay();
  }
}

async function executeBenchmarkReplay(
  fastify: FastifyInstance,
  input: BenchmarkParams,
): Promise<BenchmarkReport> {
  fastify.decisionEngine.clearDecisionMemory();
  const sessionReady = await fastify.ensureFyersSession();
  if (!sessionReady) {
    throw new Error('Fyers session expired — log in to run benchmark.');
  }

  const activeStyle = parseTradingStyle(input.tradingStyle);
  const vetoMode = input.vetoMode ?? 'strict';
  const flowMode = input.flowMode ?? 'pa-only';
  const chaseDecay = input.chaseDecay === true;
  const aiMode: BenchmarkAiMode = input.aiMode ?? 'off';
  const maxAiCalls = input.maxAiCalls ?? 40;
  const maxTradesPerDay = input.maxTradesPerDay;
  const signalFlipExit = input.signalFlipExit !== false;
  const exitPolicy = input.exitPolicy ?? 'rr-ladder';
  const positionPolicy = input.positionPolicy ?? 'flat';
  const pnlModel = input.pnlModel ?? 'index';
  const sessionDayPolicy = {
    greenDayStop: input.greenDayStop === true,
    dailyLossCapR: input.dailyLossCapR,
  };
  const noTradeWindows = input.noTradeWindows ?? [];
  const window = resolveBenchmarkWindowInput(
    {
      days: input.days,
      fromMs:
        input.fromMs != null
          ? parseEpochMs(input.fromMs, Date.now())
          : undefined,
      toMs:
        input.toMs != null ? parseEpochMs(input.toMs, Date.now()) : undefined,
      windowStartDate: input.windowStartDate,
      windowEndDate: input.windowEndDate,
    },
    { maxDays: TIMELINE_DEFAULTS.MAX_WINDOW_DAYS },
  );
  const { fromMs, toMs, days, windowStartDate, windowEndDate } = window;
  const intervalMinutes = Math.max(
    5,
    input.intervalMinutes ?? resolveBenchmarkSignalIntervalMinutes(),
  );
  const onlySession = input.sessionOnly !== false;
  const symbol = input.symbol;
  const enterThreshold =
    getStyleScoringConfig(activeStyle).convictionThreshold.enter;
  const signalProfile = resolveSignalProfile(input.signalProfile);
  const useSignalEntry = signalProfile.entryMode === 'signal';
  const requireRetest = input.requireRetest === true;
  const snapshotInput = resolveSnapshotInput(
    profileNeedsChartPatterns(signalProfile),
  );
  const runStartedAtMs = input.runStartedAtMs ?? Date.now();
  const elapsedMs = () => Date.now() - runStartedAtMs;
  const withTimer = (message: string) => {
    const label = formatBenchmarkElapsed(elapsedMs());
    return `${message} · ${label}`;
  };
  const reportProgress = (
    partial: Parameters<typeof buildProgressUpdate>[0],
  ) => {
    if (!input.onProgress) return;
    void input.onProgress(
      buildProgressUpdate({
        ...partial,
        message: partial.message ? withTimer(partial.message) : partial.message,
        elapsedMs: elapsedMs(),
      }),
    );
  };

  const fetchFromMs =
    fromMs - BENCHMARK_FETCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  reportProgress({
    phase: 'fetching',
    percent: 4,
    message: 'Fetching candle history…',
    totalDays: days,
  });

  const [candles5m, candles15m, candles1h, snapshots] = await Promise.all([
    fetchFyersHistoryCandles(fastify.fyers, {
      symbol,
      resolution: '5',
      fromMs: fetchFromMs,
      toMs,
    }).then((candles) => {
      reportProgress({
        phase: 'fetching',
        percent: 6,
        message: '5m candles loaded…',
        totalDays: days,
      });
      return candles;
    }),
    fetchFyersHistoryCandles(fastify.fyers, {
      symbol,
      resolution: '15',
      fromMs: fetchFromMs,
      toMs,
    }).then((candles) => {
      reportProgress({
        phase: 'fetching',
        percent: 7,
        message: '15m candles loaded…',
        totalDays: days,
      });
      return candles;
    }),
    fetchFyersHistoryCandles(fastify.fyers, {
      symbol,
      resolution: '60',
      fromMs: fetchFromMs,
      toMs,
    }).then((candles) => {
      reportProgress({
        phase: 'fetching',
        percent: 8,
        message: '1h candles loaded…',
        totalDays: days,
      });
      return candles;
    }),
    loadSnapshotsForWindow(fastify, symbol, activeStyle, fromMs, toMs),
  ]);

  if (!candles5m.length) {
    throw new Error(
      `Failed to fetch candle history for benchmark window. (symbol: ${symbol})`,
    );
  }

  const flipPollMinutes = resolveBenchmarkFlipPollMinutes();
  const signalAnchors = buildTimelineAnchors(
    candles5m,
    fromMs,
    toMs,
    intervalMinutes,
    onlySession,
  );
  const replayDaysSeen = new Set<string>();
  const signalAnchorTotal = Math.max(signalAnchors.length, 1);

  const deps: SnapshotDeps = {
    ta: fastify.technicalAnalysisPlugin,
    momentum: fastify.momentumDecayPlugin,
  };
  const snapshotsBySession = indexSnapshotsBySession(snapshots);
  const replayCtx: ReplayEngineContext = {
    fastify,
    deps,
    symbol,
    activeStyle,
    vetoMode,
    flowMode,
    chaseDecay,
    snapshotsBySession,
    candles5m,
    candles15m,
    candles1h,
    engineReadCache: new Map(),
    snapshotInput,
  };

  const tradeCandidates: TradeCandidate[] = [];
  const filterStats: BenchmarkFilterStats = {
    anchorsScanned: 0,
    rawDirectional: 0,
    tradeCandidates: 0,
    chaseBlocked: 0,
    chaseDecayFiltered: 0,
    convictionFiltered: 0,
    signalProfileFiltered: 0,
    noSetup: 0,
    sessionDayBlocked: 0,
    maxTradesBlocked: 0,
    cooldownBlocked: 0,
    noTradeWindowBlocked: 0,
    avoidFirst5MinBlocked: 0,
    avoidTightRangeBlocked: 0,
    requireRetestBlocked: 0,
    tradesTaken: 0,
  };
  let end5m = -1;
  let end15m = -1;
  let end1h = -1;

  for (let anchorIdx = 0; anchorIdx < signalAnchors.length; anchorIdx++) {
    await yieldToEventLoop();

    const asOfMs = signalAnchors[anchorIdx];
    const asOfSec = Math.floor(asOfMs / 1000);
    end5m = advanceCandleEndIndex(candles5m, end5m, asOfSec);
    end15m = advanceCandleEndIndex(candles15m, end15m, asOfSec);
    end1h = advanceCandleEndIndex(candles1h, end1h, asOfSec);

    const previewDayKey = getIstSessionKey(asOfSec);
    replayDaysSeen.add(previewDayKey);

    if (
      anchorIdx === 0 ||
      anchorIdx === signalAnchors.length - 1 ||
      anchorIdx % BENCHMARK_REPLAY_PROGRESS_EVERY === 0
    ) {
      reportProgress({
        phase: 'replaying',
        percent: 8 + Math.round(((anchorIdx + 1) / signalAnchorTotal) * 62),
        message: `Replaying · anchor ${anchorIdx + 1}/${signalAnchorTotal} · day ${replayDaysSeen.size}/${days}`,
        currentDay: replayDaysSeen.size,
        totalDays: days,
        anchorsDone: anchorIdx + 1,
        anchorsTotal: signalAnchorTotal,
      });
    }

    if (end5m + 1 < TIMELINE_DEFAULTS.MIN_CANDLES_FOR_ANALYSIS) {
      continue;
    }

    const snapshot = buildPriceActionSnapshot(deps, {
      symbol,
      tradingStyle: activeStyle,
      candles5m,
      candles15m,
      candles1h,
      candleEnd5m: end5m,
      candleEnd15m: end15m,
      candleEnd1h: end1h,
      asOfMs,
      ...snapshotInput,
    });
    if (!snapshot) continue;
    filterStats.anchorsScanned += 1;
    await yieldToEventLoop();

    const dayKey = previewDayKey;
    const optionData = isPaOnlyFlow(flowMode)
      ? neutralOptionMetrics(symbol, snapshot.lastPrice)
      : neutralOptionMetrics(symbol, snapshot.lastPrice);

    // Avoid first 5 minutes if requested
    if (input.avoidFirst5Min) {
      try {
        const sessionOpenSec = getNseSessionOpenSec(asOfSec);
        const fiveMinSec = sessionOpenSec + 5 * 60;
        if (asOfSec < fiveMinSec) {
          filterStats.avoidFirst5MinBlocked =
            (filterStats.avoidFirst5MinBlocked ?? 0) + 1;
          continue;
        }
      } catch {
        // ignore any calculation errors and proceed
      }
    }

    // Avoid tight range / compression when requested
    if (input.avoidTightRange) {
      const regime = snapshot.confluenceContext?.volatility;
      const atrPct = regime?.atrPercentile ?? 100;
      const sessionPhase = regime?.sessionPhase;
      if (sessionPhase === 'compression' || atrPct < 30) {
        filterStats.avoidTightRangeBlocked =
          (filterStats.avoidTightRangeBlocked ?? 0) + 1;
        continue;
      }
    }

    if (requireRetest) {
      const retestTimeframes =
        useSignalEntry && signalProfile.timeframes?.length
          ? signalProfile.timeframes
          : [snapshot.primaryTimeframe as '5m' | '15m' | '1h'];
      const hasRetest = retestTimeframes.some(
        (tf) => snapshot.componentSignals?.[tf]?.retest === 1,
      );
      if (!hasRetest) {
        filterStats.requireRetestBlocked =
          (filterStats.requireRetestBlocked ?? 0) + 1;
        continue;
      }
    }

    const decision = fastify.decisionEngine.computeTradeDecision(
      snapshot as PriceActionResponse,
      optionData,
      activeStyle,
      { vetoMode, flowMode, chaseDecay },
    );

    let entryAction: 'CE-BUY' | 'PE-BUY' | null = null;
    let entryConviction = decision.conviction;

    if (useSignalEntry) {
      const match = evaluateSignalProfile(
        snapshot as PriceActionResponse,
        signalProfile,
        String(activeStyle),
      );
      if (!match) {
        filterStats.signalProfileFiltered =
          (filterStats.signalProfileFiltered ?? 0) + 1;
        continue;
      }
      entryAction = match.action;
      entryConviction = Math.max(
        enterThreshold,
        Math.round(Math.abs(snapshot.timeframeScores[match.timeframe] ?? 0) * 100),
      );
    } else {
      cacheEngineRead(replayCtx, {
        asOfMs,
        dayKey,
        action: decision.action,
        conviction: decision.conviction,
      });

      if (chaseDecay && decision.chaseDecay?.blocked) {
        filterStats.chaseBlocked += 1;
        continue;
      }

      if (decision.action !== 'CE-BUY' && decision.action !== 'PE-BUY') {
        continue;
      }

      filterStats.rawDirectional += 1;

      if (decision.conviction < enterThreshold) {
        if (chaseDecay && (decision.chaseDecay?.decayPercent ?? 0) > 0) {
          filterStats.chaseDecayFiltered += 1;
        } else {
          filterStats.convictionFiltered += 1;
        }
        continue;
      }

      entryAction = decision.action;
      entryConviction = decision.conviction;
    }

    if (!entryAction) continue;

    if (useSignalEntry) {
      filterStats.rawDirectional += 1;
    }

    const tradeSetup = useSignalEntry
      ? resolveSignalTradeSetup(snapshot, entryAction)
      : snapshot.tradeSetup;
    if (!tradeSetup) {
      filterStats.noSetup += 1;
      continue;
    }

    if (isWithinNoTradeWindow(asOfMs, noTradeWindows)) {
      filterStats.noTradeWindowBlocked =
        (filterStats.noTradeWindowBlocked ?? 0) + 1;
      continue;
    }

    filterStats.tradeCandidates += 1;
    tradeCandidates.push({
      asOfMs,
      asOfSec,
      dayKey,
      action: entryAction,
      conviction: entryConviction,
      bias: useSignalEntry ? signalProfile.label : decision.bias,
      snapshot: { ...snapshot, tradeSetup },
      optionSource: 'neutral_fallback',
      optionData,
      nearestSnap: null,
    });
  }

  const tradeCooldownMs = SESSION_TRADE_COOLDOWN_MINUTES * 60 * 1000;
  let sessionDayKey = '';
  let ceCooldownUntilMs = 0;
  let peCooldownUntilMs = 0;
  let sessionTradesTaken = 0;
  let sessionDayState = createBenchmarkSessionDayState();

  const baselineTrades: BenchmarkTradeRow[] = [];
  const activeTrades: BenchmarkTradeRow[] = [];
  let aiCalls = 0;

  const tradeCandidateTotal = Math.max(tradeCandidates.length, 1);

  for (let tradeIdx = 0; tradeIdx < tradeCandidates.length; tradeIdx++) {
    await yieldToEventLoop();

    if (
      tradeIdx === 0 ||
      tradeIdx === tradeCandidates.length - 1 ||
      tradeIdx % 3 === 0
    ) {
      reportProgress({
        phase: aiMode !== 'off' ? 'ai' : 'simulating',
        percent: 72 + Math.round((tradeIdx / tradeCandidateTotal) * 18),
        message:
          aiMode !== 'off'
            ? `Simulating trades & AI · ${tradeIdx + 1}/${tradeCandidates.length}`
            : `Simulating trades · ${tradeIdx + 1}/${tradeCandidates.length}`,
        totalDays: days,
        currentDay: days,
      });
    }

    const candidate = tradeCandidates[tradeIdx];
    const { asOfMs, asOfSec, dayKey, action, conviction, snapshot } = candidate;

    if (dayKey !== sessionDayKey) {
      sessionDayKey = dayKey;
      ceCooldownUntilMs = 0;
      peCooldownUntilMs = 0;
      sessionTradesTaken = 0;
      sessionDayState = createBenchmarkSessionDayState();
    }

    if (isBenchmarkSessionDayBlocked(sessionDayState, sessionDayPolicy)) {
      filterStats.sessionDayBlocked += 1;
      continue;
    }

    if (maxTradesPerDay != null && sessionTradesTaken >= maxTradesPerDay) {
      filterStats.maxTradesBlocked += 1;
      continue;
    }

    if (action === 'CE-BUY' && asOfMs < ceCooldownUntilMs) {
      filterStats.cooldownBlocked += 1;
      continue;
    }
    if (action === 'PE-BUY' && asOfMs < peCooldownUntilMs) {
      filterStats.cooldownBlocked += 1;
      continue;
    }

    const baseSetup = snapshot.tradeSetup;
    if (!baseSetup) continue;

    const setup =
      buildBenchmarkTradeSetup(
        action,
        baseSetup.entry,
        baseSetup.rawStopLoss,
        baseSetup.atrUsed,
      ) ?? baseSetup;

    const { untilSec, scope } = resolveSimulationUntilSec(
      asOfSec,
      activeStyle,
      Math.floor(toMs / 1000),
    );
    const forward = sliceCandlesAfter(candles5m, asOfSec, untilSec);
    const flipExits = signalFlipExit
      ? buildFlipExitSignals(
          asOfMs,
          action,
          untilSec,
          await collectEnginePollReads(
            replayCtx,
            asOfMs,
            untilSec * 1000,
            flipPollMinutes,
            (pollDone, pollTotal) => {
              reportProgress({
                phase: 'simulating',
                percent:
                  72 +
                  Math.round(
                    ((tradeIdx + pollDone / Math.max(pollTotal, 1)) /
                      tradeCandidateTotal) *
                      18,
                  ),
                message: `Simulating · trade ${tradeIdx + 1}/${tradeCandidates.length} · flip poll ${pollDone}/${pollTotal}`,
                totalDays: days,
                currentDay: days,
              });
            },
          ),
          enterThreshold,
        )
      : [];

    const outcome = simulateTradeOutcomeWithTrailingFloor(
      action as TradeAction,
      setup,
      forward,
      scope,
      {
        flipExits,
        enableFlipExit: signalFlipExit,
        exitPolicy,
        positionPolicy,
      },
    );

    if (outcome.status === 'NO-TRADE') continue;

    sessionTradesTaken += 1;

    const tp1 = setup.takeProfits.find((t) => t.multiplier === 1.5)?.price ?? 0;
    const tp2 = setup.takeProfits.find((t) => t.multiplier === 2.5)?.price ?? 0;
    const tp3 = setup.takeProfits.find((t) => t.multiplier === 4)?.price ?? 0;
    const pnlPercent =
      setup.entry > 0 ? +((outcome.pnl / setup.entry) * 100).toFixed(2) : 0;

    let aiAnalysis = undefined;
    let convictionWithAi = conviction;

    if (aiMode !== 'off' && aiCalls < maxAiCalls) {
      try {
        const primaryTf =
          activeStyle === TradingStyle.Scalper
            ? '5m'
            : activeStyle === TradingStyle.Positional
              ? '1h'
              : '15m';
        const primaryScore = snapshot.timeframeScores?.[primaryTf] ?? 0;
        const aiResponse = await fastify.aiAgent?.analyze({
          symbol,
          tradingStyle: activeStyle,
          action,
          conviction,
          bias: candidate.bias,
          skipCache: true,
          cacheSalt: String(asOfMs),
          priceAction: {
            primaryTF: primaryTf,
            primaryScore,
            levels: snapshot.levels,
            momentum: snapshot.momentum ?? {},
            structure: snapshot.structureElements ?? {},
          },
          optionFlow: {
            overallScore: candidate.optionData.score ?? 0,
            ivRegime: String(candidate.optionData.ivRegime ?? 'Normal IV'),
            topComponents: (candidate.nearestSnap?.components ?? [])
              .slice(0, 3)
              .map((c) => ({
                name: c.name,
                score: c.score,
                interpretation: c.interpretation ?? '',
              })),
          },
        });
        if (aiResponse) {
          aiAnalysis = aiResponse;
          aiCalls += 1;
          if (aiMode === 'active' && aiResponse.confidenceAdjustment) {
            convictionWithAi = Math.min(
              95,
              Math.max(0, conviction + aiResponse.confidenceAdjustment),
            );
          }
        }
      } catch (err) {
        fastify.log.warn({ err }, 'benchmark AI call failed');
      }
    }

    const row: BenchmarkTradeRow = {
      signalAtMs: asOfMs,
      signalAtISO: toIso(asOfMs),
      sessionDate: dayKey,
      action,
      indexEntry: setup.entry,
      indexExit: outcome.exitPrice,
      stopLoss: setup.stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      takeProfit3: tp3,
      setup,
      exitStatus: outcome.status as BenchmarkTradeRow['exitStatus'],
      hitLevel: (outcome.hitLevel ?? 'OPEN') as BenchmarkTradeRow['hitLevel'],
      pnlPoints: outcome.pnl,
      pnlR: outcome.pnlR,
      pnlPercent,
      peakR: outcome.peakR ?? 0,
      maxAdverseR: outcome.maxAdverseR ?? 0,
      givebackR: outcome.givebackR ?? 0,
      barsHeld: outcome.barsHeld,
      conviction,
      convictionWithAi:
        aiMode === 'active' ? convictionWithAi : undefined,
      optionSource: candidate.optionSource,
      engineVerdict: '',
      aiAnalysis,
    };
    row.engineVerdict = buildEngineVerdict(row);
    row.aiVerdictSummary = buildAiVerdictSummary(aiAnalysis, row, aiMode);

    if (pnlModel === 'synthetic_weekly_option') {
      const optionSim = simulateSyntheticWeeklyOption({
        signalAtMs: asOfMs,
        exitAtMs: outcome.exitAt ?? asOfMs,
        action,
        indexEntry: setup.entry,
        indexExit: outcome.exitPrice,
        symbol,
      });
      row.optionEntryPremium = optionSim.entryPremium;
      row.optionExitPremium = optionSim.exitPremium;
      row.optionDelta = optionSim.delta;
      row.optionDteDays = optionSim.dteDays;
      row.optionLots = optionSim.lots;
      row.optionLotSize = optionSim.lotSize;
      row.pnlInr = optionSim.pnlInr;
    }

    baselineTrades.push(row);
    filterStats.tradesTaken += 1;

    if (aiMode === 'active') {
      if (convictionWithAi >= enterThreshold) {
        activeTrades.push({ ...row, conviction: convictionWithAi });
      }
    }

    sessionDayState = applyBenchmarkTradeToSessionDay(
      sessionDayState,
      outcome.pnlR,
      sessionDayPolicy,
    );

    const closedAtMs = outcome.exitAt ?? asOfMs;
    if (action === 'CE-BUY') {
      ceCooldownUntilMs = closedAtMs + tradeCooldownMs;
    } else {
      peCooldownUntilMs = closedAtMs + tradeCooldownMs;
    }
  }

  reportProgress({
    phase: 'finalizing',
    percent: 92,
    message: 'Building report…',
    totalDays: days,
    currentDay: days,
  });

  const snapshotDays = new Set(
    snapshots.map((s) =>
      getIstSessionKey(Math.floor(s.bucketAt.getTime() / 1000)),
    ),
  ).size;

  const startingCapitalInr =
    input.startingCapitalInr ?? BENCHMARK_DEFAULT_STARTING_CAPITAL_INR;
  const capitalProjection = buildCapitalProjection(
    baselineTrades,
    activeStyle,
    startingCapitalInr,
    input.riskPercentPerTrade,
    pnlModel,
  );

  const dailyCapNote =
    maxTradesPerDay != null
      ? `Max ${maxTradesPerDay} entr${maxTradesPerDay === 1 ? 'y' : 'ies'} per session day.`
      : 'Unlimited entries per session day.';

  const flipNote = signalFlipExit
    ? `Signal-flip exit: once peak ≥1R, 2 consecutive opposite polls (${flipPollMinutes}m replay / 60s live) exit at market.`
    : 'Signal-flip exit disabled for this run.';
  const sessionPolicyNotes = describeBenchmarkSessionDayPolicy(sessionDayPolicy);
  const chaseDecayNote = chaseDecay ? CHASE_DECAY_BENCHMARK_NOTE : '';
  const signalNote = useSignalEntry
    ? `Signal entry: ${signalProfile.label} — fast breakout/volume/pattern gates (skips PA+option conviction blend).`
    : '';

  return {
    params: {
      ...input,
      symbol,
      tradingStyle: activeStyle,
      days,
      intervalMinutes,
      vetoMode,
      flowMode,
      aiMode,
      enterThreshold,
      maxTradesPerDay,
      signalFlipExit,
      startingCapitalInr,
      riskPercentPerTrade: capitalProjection.summary.riskPercentPerTrade,
      pnlModel,
      greenDayStop: sessionDayPolicy.greenDayStop || undefined,
      dailyLossCapR: sessionDayPolicy.dailyLossCapR,
      chaseDecay: chaseDecay || undefined,
      noTradeWindows: noTradeWindows.length ? noTradeWindows : undefined,
      exitPolicy: exitPolicy !== 'rr-ladder' ? exitPolicy : undefined,
      positionPolicy:
        positionPolicy !== 'flat' ? positionPolicy : undefined,
      toMs,
      fromMs,
      windowStartDate,
      windowEndDate,
    },
    filterStats,
    simulationNote: [
      pnlModel === 'synthetic_weekly_option'
        ? SYNTHETIC_WEEKLY_OPTION_NOTE
        : `Spot index simulation: ${describeExitPolicy(exitPolicy)} · ${describePositionPolicy(positionPolicy)} Session fade tighten last 45m; flip/SL first.`,
      dailyCapNote,
      ...sessionPolicyNotes,
      chaseDecayNote,
      noTradeWindows.length
        ? `No-trade windows (IST): ${formatNoTradeWindows(noTradeWindows)}.`
        : '',
      signalNote,
      flipNote,
    ]
      .filter(Boolean)
      .join(' '),
    signalProfileLabel: useSignalEntry ? signalProfile.label : undefined,
    optionFlowNote: isPaOnlyFlow(flowMode)
      ? 'PA-only flow — option chain ignored for conviction.'
      : snapshots.length > 0
        ? `Option snapshots used on ${snapshotDays} session day(s); neutral fallback elsewhere.`
        : 'No option snapshots in window — blend mode uses neutral option flow (PA-heavy).',
    aiComparison: buildAiComparison(
      baselineTrades,
      aiMode === 'active' ? activeTrades : aiMode === 'shadow' ? baselineTrades : null,
      aiMode,
      {
        signalFlipExit,
        maxTradesPerDay,
        greenDayStop: sessionDayPolicy.greenDayStop,
        dailyLossCapR: sessionDayPolicy.dailyLossCapR,
      },
    ),
    trades: capitalProjection.trades,
    equityCurve: buildEquityCurve(baselineTrades),
    capitalSummary: capitalProjection.summary,
    capitalCurve: capitalProjection.capitalCurve,
    stopLossNote: BENCHMARK_STOP_LOSS_NOTE,
    generatedAt: new Date().toISOString(),
    durationMs: elapsedMs(),
  };
}