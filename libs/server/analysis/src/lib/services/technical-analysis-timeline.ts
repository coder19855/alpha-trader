import { HttpStatusCode } from 'axios';
import { FastifyInstance } from 'fastify';
import {
  FLIP_POLL_INTERVAL_MINUTES,
  SESSION_OVERLAP_GUARD,
  SESSION_TRADE_COOLDOWN_MINUTES,
  TIMELINE_DEFAULTS,
  TIMELINE_STOP_ATR,
  TechnicalAnalysisTimelineResponse,
  TimelinePoint,
  TradingStyle,
} from '@alpha-trader/server-shared';
import { fetchFyersHistoryCandles } from '@alpha-trader/server-market-data';
import type { EnginePollRead } from '../technical-analysis/flip-exit-policy.js';
import { simulateTradeOutcome } from '../technical-analysis/timeline-utils.js';
import { buildPriceActionSnapshot } from '../technical-analysis/snapshot.js';
import {
  buildTimelineAnchors,
  calcOutcomeVsEnd,
  computeWindow,
  getIstSessionKey,
  mapFyersCandlesToOhlc,
  parseEpochMs,
  resolveSimulationUntilSec,
  sliceCandlesAfter,
  sliceCandlesUpTo,
  summarizeTimelinePoints,
  toIso,
} from '../technical-analysis/timeline-utils.js';

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

export interface TimelineQuery {
  symbol: string;
  tradingStyle?: string;
  to?: string | number;
  days?: string | number;
  interval?: string | number;
  sessionOnly?: string | boolean;
  maxPoints?: string | number;
  includeCandles?: string | boolean;
}

export async function computeTechnicalAnalysisTimeline(
  fastify: FastifyInstance,
  query: TimelineQuery,
): Promise<TechnicalAnalysisTimelineResponse> {
  const {
    symbol,
    tradingStyle: styleQuery,
    to,
    days,
    interval,
    sessionOnly,
    maxPoints,
    includeCandles,
  } = query;

  if (!symbol?.trim()) {
    throw Object.assign(new Error('symbol is required'), { statusCode: 400 });
  }

  const activeStyle = parseTradingStyle(styleQuery);
  const toMs = parseEpochMs(to, Date.now());
  const requestedDays =
    days !== undefined && days !== '' ? Number(days) : undefined;
  const windowDays = Math.min(
    TIMELINE_DEFAULTS.MAX_WINDOW_DAYS,
    Math.max(
      TIMELINE_DEFAULTS.MIN_WINDOW_DAYS,
      Number.isFinite(requestedDays) && requestedDays! > 0
        ? requestedDays!
        : TIMELINE_DEFAULTS.WINDOW_DAYS,
    ),
  );
  const intervalMinutes = Math.max(
    5,
    Number(interval) || TIMELINE_DEFAULTS.INTERVAL_MINUTES,
  );
  const onlySession =
    sessionOnly === undefined ||
    sessionOnly === 'true' ||
    sessionOnly === true;
  const maxPointsLimit =
    maxPoints !== undefined && maxPoints !== ''
      ? Math.max(1, Number(maxPoints))
      : undefined;
  const withCandles =
    includeCandles === 'true' ||
    includeCandles === true ||
    includeCandles === '1';

  const { fromMs, fetchFromMs } = computeWindow(toMs, windowDays);

  let candles5m;
  let candles15m;
  let candles1h;
  try {
    [candles5m, candles15m, candles1h] = await Promise.all([
      fetchFyersHistoryCandles(fastify.fyers, {
        symbol,
        resolution: '5',
        fromMs: fetchFromMs,
        toMs,
      }),
      fetchFyersHistoryCandles(fastify.fyers, {
        symbol,
        resolution: '15',
        fromMs: fetchFromMs,
        toMs,
      }),
      fetchFyersHistoryCandles(fastify.fyers, {
        symbol,
        resolution: '60',
        fromMs: fetchFromMs,
        toMs,
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(message), { statusCode: HttpStatusCode.BadRequest });
  }

  if (!candles5m.length) {
    throw Object.assign(
      new Error('No candle data available for the requested window'),
      { statusCode: HttpStatusCode.BadRequest },
    );
  }

  const anchors = buildTimelineAnchors(
    candles5m,
    fromMs,
    toMs,
    intervalMinutes,
    onlySession,
  );
  const flipPollAnchors = buildTimelineAnchors(
    candles5m,
    fromMs,
    toMs,
    FLIP_POLL_INTERVAL_MINUTES,
    onlySession,
  );

  if (anchors.length === 0) {
    throw Object.assign(
      new Error(
        'No session candles found in the analysis window. Try sessionOnly=false or a different date range.',
      ),
      { statusCode: 400 },
    );
  }

  const deps = {
    ta: fastify.technicalAnalysisPlugin,
    momentum: fastify.momentumDecayPlugin,
  };

  const endSpot =
    candles5m[candles5m.length - 1][4] ||
    candles15m[candles15m.length - 1]?.[4] ||
    0;

  const points: TimelinePoint[] = [];
  const flipPollReads: EnginePollRead[] = [];

  for (const asOfMs of flipPollAnchors) {
    const asOfSec = Math.floor(asOfMs / 1000);
    const slice5m = sliceCandlesUpTo(candles5m, asOfSec);
    const slice15m = sliceCandlesUpTo(candles15m, asOfSec);
    const slice1h = sliceCandlesUpTo(candles1h, asOfSec);
    if (slice5m.length < TIMELINE_DEFAULTS.MIN_CANDLES_FOR_ANALYSIS) {
      continue;
    }
    const pollSnapshot = buildPriceActionSnapshot(deps, {
      symbol,
      tradingStyle: activeStyle,
      candles5m: slice5m,
      candles15m: slice15m,
      candles1h: slice1h,
      asOfMs,
    });
    if (!pollSnapshot) continue;
    flipPollReads.push({
      asOfMs,
      dayKey: getIstSessionKey(asOfSec),
      action:
        pollSnapshot.signal.structuralAction ?? pollSnapshot.signal.action,
      conviction: pollSnapshot.signal.confidence,
    });
  }

  const windowToSec = Math.floor(toMs / 1000);
  const defaultSimScope =
    activeStyle === TradingStyle.Positional ? 'window' : 'session';

  const tradeCooldownMs = SESSION_TRADE_COOLDOWN_MINUTES * 60 * 1000;
  let sessionDayKey = '';
  let ceCooldownUntilMs = 0;
  let peCooldownUntilMs = 0;
  let ceOpenUntilMs = 0;
  let peOpenUntilMs = 0;

  for (const asOfMs of anchors) {
    const asOfSec = Math.floor(asOfMs / 1000);
    const slice5m = sliceCandlesUpTo(candles5m, asOfSec);
    const slice15m = sliceCandlesUpTo(candles15m, asOfSec);
    const slice1h = sliceCandlesUpTo(candles1h, asOfSec);

    if (slice5m.length < TIMELINE_DEFAULTS.MIN_CANDLES_FOR_ANALYSIS) {
      continue;
    }

    const snapshot = buildPriceActionSnapshot(deps, {
      symbol,
      tradingStyle: activeStyle,
      candles5m: slice5m,
      candles15m: slice15m,
      candles1h: slice1h,
      asOfMs,
    });

    if (!snapshot) continue;

    const dayKey = getIstSessionKey(asOfSec);
    if (dayKey !== sessionDayKey) {
      sessionDayKey = dayKey;
      ceCooldownUntilMs = 0;
      peCooldownUntilMs = 0;
      ceOpenUntilMs = 0;
      peOpenUntilMs = 0;
    }

    let signalAction = snapshot.signal.action;
    let signalConfidence = snapshot.signal.confidence;
    let signalStrength = snapshot.signal.strength;
    let tradeSetup = snapshot.tradeSetup;
    let vetoReason = snapshot.signal.vetoReason;
    let structuralAction = snapshot.signal.structuralAction;

    if (
      activeStyle === TradingStyle.Intraday &&
      SESSION_OVERLAP_GUARD.ENABLED &&
      signalAction === 'CE-BUY' &&
      asOfMs < ceOpenUntilMs
    ) {
      signalAction = 'NO-TRADE';
      signalConfidence = 0;
      signalStrength = 'LOW';
      tradeSetup = undefined;
      vetoReason = 'Session overlap: CE position still open from prior entry';
      structuralAction = 'CE-BUY';
    } else if (
      activeStyle === TradingStyle.Intraday &&
      SESSION_OVERLAP_GUARD.ENABLED &&
      signalAction === 'PE-BUY' &&
      asOfMs < peOpenUntilMs
    ) {
      signalAction = 'NO-TRADE';
      signalConfidence = 0;
      signalStrength = 'LOW';
      tradeSetup = undefined;
      vetoReason = 'Session overlap: PE position still open from prior entry';
      structuralAction = 'PE-BUY';
    } else if (
      activeStyle === TradingStyle.Intraday &&
      signalAction === 'CE-BUY' &&
      asOfMs < ceCooldownUntilMs
    ) {
      signalAction = 'NO-TRADE';
      signalConfidence = 0;
      signalStrength = 'LOW';
      tradeSetup = undefined;
      vetoReason = `Session cooldown: CE blocked for ${SESSION_TRADE_COOLDOWN_MINUTES}m after prior CE trade`;
      structuralAction = 'CE-BUY';
    } else if (
      activeStyle === TradingStyle.Intraday &&
      signalAction === 'PE-BUY' &&
      asOfMs < peCooldownUntilMs
    ) {
      signalAction = 'NO-TRADE';
      signalConfidence = 0;
      signalStrength = 'LOW';
      tradeSetup = undefined;
      vetoReason = `Session cooldown: PE blocked for ${SESSION_TRADE_COOLDOWN_MINUTES}m after prior PE trade`;
      structuralAction = 'PE-BUY';
    }

    const { untilSec, scope: pointSimScope } = resolveSimulationUntilSec(
      asOfSec,
      activeStyle,
      windowToSec,
    );
    const forwardCandles = sliceCandlesAfter(candles5m, asOfSec, untilSec);
    const tradeOutcome = simulateTradeOutcome(
      signalAction,
      tradeSetup,
      forwardCandles,
      pointSimScope,
    );

    if (
      activeStyle === TradingStyle.Intraday &&
      tradeOutcome.status !== 'NO-TRADE'
    ) {
      const closedAtMs = tradeOutcome.exitAt ?? asOfMs;
      if (signalAction === 'CE-BUY') {
        if (SESSION_OVERLAP_GUARD.ENABLED && tradeOutcome.exitAt) {
          ceOpenUntilMs = tradeOutcome.exitAt;
        }
        ceCooldownUntilMs = closedAtMs + tradeCooldownMs;
      }
      if (signalAction === 'PE-BUY') {
        if (SESSION_OVERLAP_GUARD.ENABLED && tradeOutcome.exitAt) {
          peOpenUntilMs = tradeOutcome.exitAt;
        }
        peCooldownUntilMs = closedAtMs + tradeCooldownMs;
      }
    }

    const direction =
      signalAction === 'CE-BUY' ? 1 : signalAction === 'PE-BUY' ? -1 : 0;

    points.push({
      asOf: asOfMs,
      asOfISO: toIso(asOfMs),
      spot: snapshot.lastPrice,
      primaryTimeframe: snapshot.primaryTimeframe as TimelinePoint['primaryTimeframe'],
      timeframeScores: snapshot.timeframeScores,
      mtfScore: snapshot.confluence.mtfScore,
      aligned: snapshot.confluence.aligned,
      signal: {
        action: signalAction,
        confidence: signalConfidence,
        strength: signalStrength,
        vetoReason,
        structuralAction,
      },
      candlestick: snapshot.candlestick,
      chartPatterns: snapshot.chartPatterns,
      momentum: {
        recent: snapshot.momentum?.recent ?? {
          '5m': 0,
          '15m': 0,
          '1h': 0,
        },
        adx: snapshot.adx,
        fakeout: snapshot.momentum?.fakeout,
      },
      atr: snapshot.atr,
      structureElements: snapshot.structureElements,
      momentumDecay: snapshot.momentumDecay,
      confluenceContext: snapshot.confluenceContext,
      levels: snapshot.levels,
      tradeSetup,
      tradeOutcome,
      outcomeVsEnd: calcOutcomeVsEnd(
        tradeSetup?.entry ?? snapshot.lastPrice,
        endSpot,
        direction as 1 | -1 | 0,
      ),
    });
  }

  if (points.length === 0) {
    throw Object.assign(
      new Error(
        'Insufficient candle history to compute timeline points. Widen the fetch window or reduce interval.',
      ),
      { statusCode: 400 },
    );
  }

  const trimmedPoints =
    maxPointsLimit != null && Number.isFinite(maxPointsLimit)
      ? points.slice(-maxPointsLimit)
      : points;

  return {
    replayMode: 'price_action_only',
    optionFlowNote:
      'Historical option chain is not available. Timeline uses price action only.',
    simulation: {
      scope: defaultSimScope,
      stopModel: 'atr_clamped_swing',
      exitModel: 'trailing_floor',
      rrTargets: ['1:1.5', '1:2.5', '1:4'],
      atrStopBand: {
        minMult: TIMELINE_STOP_ATR.MIN_MULT,
        maxMult: TIMELINE_STOP_ATR.MAX_MULT,
      },
      sessionCooldownMinutes: SESSION_TRADE_COOLDOWN_MINUTES,
    },
    symbol,
    tradingStyle: activeStyle,
    window: {
      from: fromMs,
      to: toMs,
      fromISO: toIso(fromMs),
      toISO: toIso(toMs),
      days: windowDays,
      ...(requestedDays !== undefined &&
      Number.isFinite(requestedDays) &&
      requestedDays > 0
        ? { requestedDays }
        : {}),
      maxDays: TIMELINE_DEFAULTS.MAX_WINDOW_DAYS,
      minDays: TIMELINE_DEFAULTS.MIN_WINDOW_DAYS,
    },
    intervalMinutes,
    sessionOnly: onlySession,
    summary: summarizeTimelinePoints(trimmedPoints, endSpot),
    points: trimmedPoints,
    ...(withCandles
      ? {
          spotCandles: {
            '5m': mapFyersCandlesToOhlc(candles5m),
            '15m': mapFyersCandlesToOhlc(candles15m),
            '1h': mapFyersCandlesToOhlc(candles1h),
          },
        }
      : {}),
  };
}

export default async function technicalAnalysisTimelineRoute(
  fastify: FastifyInstance,
) {
  fastify.get('/api/technical-analysis/timeline', async (request, reply) => {
    try {
      const payload = await computeTechnicalAnalysisTimeline(
        fastify,
        request.query as TimelineQuery,
      );
      return payload;
    } catch (error) {
      const statusCode =
        error && typeof error === 'object' && 'statusCode' in error
          ? Number((error as { statusCode: number }).statusCode)
          : HttpStatusCode.InternalServerError;
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to compute technical analysis timeline';
      return reply.status(statusCode).send({ error: message });
    }
  });
}