import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  computePaDecision,
  computePriceAction,
  computeTechnicalAnalysisTimeline,
  readOptionOverlay,
  refreshOptionOverlay,
  type OptionOverlayStatus,
} from '@alpha-trader/server-analysis';
import {
  attachAutoExitGuard,
  buildOpenPositionContextFromPositions,
  computeManagementAdvice,
  fetchOpenIndexOptionPositions,
  refreshAutoExitGuardDisplay,
  resolveHeldEntrySpot,
  toManagementDecisionPayload,
  PositionManagementContext,
} from '@alpha-trader/server-position';
import { OpenPositionMonitorContext } from '@alpha-trader/server-shared';
import {
  DECK_LIVE_TIMELINE,
  FlowMode,
  FYERS_OPTION_INDEX_SYMBOLS,
  PriceActionResponse,
  TechnicalAnalysisTimelineResponse,
  TradeDecisionAlertPayload,
  TradingStyle,
  VetoMode,
  getStyleScoringConfig,
  isIndianMarketOpen,
  isVetoOff,
} from '@alpha-trader/server-shared';
import { attachAutoEntryGuard } from './auto-entry-runner.js';
import { resolveAutoEntryPresetSignal } from './auto-entry-preset.js';
import { buildDeckGauges, DeckGauges } from './deck-gauge.js';
import { buildPaConvictionLedger } from './pa-conviction-ledger.js';
import {
  buildDeckEvents,
  extractComponentGauges,
  extractPaDrilldown,
  extractVetoBreakup,
  extractPatternInsightsFromPriceAction,
  spotSeriesToSyntheticCandles,
  timelineMarkers,
  timelineToSpotSeries,
  timelineToVetoSeries,
} from './deck-replay-utils.js';
import {
  buildOptionRecommendedStrategies,
  buildTradeGuidanceForPa,
  extractDeckStrategyPayload,
} from './deck-strategy.js';
import { extractDeckPaExtras } from './deck-pa-extras.js';
import { resolveDeckAlignmentCount } from './deck-tf-alignment.js';
import { resolveDeckMarketRegime, type DeckMarketRegime } from './market-regime.js';
import { syncTradeJournalFromPositions } from '@alpha-trader/server-preferences';
import {
  buildDeckOpenPositions,
  DeckOpenPositionsPayload,
  refreshDeckOpenPositionsLtp,
} from './deck-open-positions.js';


export interface DeckSpotPoint {
  t: number;
  v: number;
}

export interface DeckCandlePoint {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface DeckMarker {
  t: number;
  type: 'signal' | 'trade' | 'flip';
  label: string;
  action?: string;
}

export interface DeckLiveStreamTick {
  type: 'tick';
  asOf: string;
  /** When price-action / conviction was last fully recomputed (ISO). */
  signalCalculatedAt: string;
  tfAligned?: number;
  tfAlignedTotal?: number;
  marketOpen: boolean;
  action: string;
  bias: string;
  conviction: number;
  weightedBaseConviction: number;
  convictionBonuses: Array<{ label: string; points: number }>;
  paConvictionBonuses?: Array<{ label: string; points: number }>;
  paBaseConviction?: number;
  marketRegime?: DeckMarketRegime;
  entryThreshold: number;
  lastPrice: number;
  /** Session change vs previous close (Fyers ch / chp). */
  dayChange: number;
  dayChangePct: number;
  chartVetoed: boolean;
  gauges: DeckGauges;
  lanes: {
    optionPercent: number;
    priceActionPercent: number;
    combinedPercent: number;
  };
  spotSeries: DeckSpotPoint[];
  optionComponents: ReturnType<typeof extractComponentGauges>['optionComponents'];
  priceActionComponents: ReturnType<
    typeof extractComponentGauges
  >['priceActionComponents'];
  paDrilldown: ReturnType<typeof extractPaDrilldown>;
  vetoBreakup: ReturnType<typeof extractVetoBreakup>;
  flowMode: FlowMode;
  vetoReason?: string;
  structuralAction?: string;
  managementContext?: PositionManagementContext;
  openPositions?: DeckOpenPositionsPayload;
  openPositionsLtpOnly?: boolean;
  patternInsights?: ReturnType<typeof extractPatternInsightsFromPriceAction>;
  chartPatternNeckline?: number;
  strategyRecommendation?: ReturnType<typeof extractDeckStrategyPayload>;
  tradeSetup?: ReturnType<typeof extractDeckPaExtras>['tradeSetup'];
  componentSignals?: ReturnType<typeof extractDeckPaExtras>['componentSignals'];
  primaryTimeframe?: string;
}

export interface DeckLivePayload extends Omit<DeckLiveStreamTick, 'type'> {
  mode: 'live';
  symbol: string;
  symbolLabel: string;
  lotSize?: number | null;
  tradingStyle: string;
  vetoMode: VetoMode;
  vetoOff: boolean;
  spotCandles: DeckCandlePoint[];
  spotCandles5m: DeckCandlePoint[];
  spotCandles15m: DeckCandlePoint[];
  spotCandles1h: DeckCandlePoint[];
  convictionSeries: Array<{
    t: number;
    option: number;
    priceAction: number;
    combined: number;
  }>;
  markers: DeckMarker[];
  events: ReturnType<typeof buildDeckEvents>;
  vetoTimeline: ReturnType<typeof timelineToVetoSeries>;
  openPositions: DeckOpenPositionsPayload;
}

export interface DeckPositionsLtpPatch {
  type: 'ltp';
  asOf: string;
  lastPrice: number | null;
  dayChange?: number;
  dayChangePct?: number;
  openPositions: DeckOpenPositionsPayload;
  openPositionsLtpOnly: true;
  managementContext?: PositionManagementContext;
}

export interface DeckPositionsUpdate {
  type: 'positions';
  asOf: string;
  openPositions: DeckOpenPositionsPayload;
  managementContext?: PositionManagementContext;
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

function primaryTimeframeForStyle(style: TradingStyle): '5m' | '15m' | '1h' {
  if (style === TradingStyle.Scalper) return '5m';
  if (style === TradingStyle.Positional) return '1h';
  return '15m';
}

function shortSymbol(symbol: string): string {
  const part = symbol.split(':')[1] || symbol;
  return part.replace('-INDEX', '');
}

export function resolveLiveIndexQuote(
  fastify: FastifyInstance,
  indexSymbol: string,
  fallback: number,
): { ltp: number; dayChange: number; dayChangePct: number } {
  const quote = fastify.fyersMarketStream?.getQuote?.(indexSymbol) as
    | { ltp?: number; ch?: number; chp?: number }
    | null
    | undefined;
  if (quote && Number.isFinite(quote.ltp) && (quote.ltp ?? 0) > 0) {
    return {
      ltp: quote.ltp!,
      dayChange: Number(quote.ch ?? 0),
      dayChangePct: Number(quote.chp ?? 0),
    };
  }

  const streamed = fastify.fyersMarketStream?.getIndexLtp(indexSymbol);
  const ltp = streamed ?? fallback;
  return { ltp, dayChange: 0, dayChangePct: 0 };
}

function resolveLiveIndexPrice(
  fastify: FastifyInstance,
  indexSymbol: string,
  fallback: number,
): number {
  return resolveLiveIndexQuote(fastify, indexSymbol, fallback).ltp;
}

function mergeSpotSeriesWithStream(
  timelineSeries: DeckSpotPoint[],
  streamSeries: DeckSpotPoint[],
): DeckSpotPoint[] {
  if (!streamSeries.length) return timelineSeries;
  const cutoff = streamSeries[0].t;
  const base = timelineSeries.filter((p) => p.t < cutoff);
  return [...base, ...streamSeries];
}

type DeckDecision = TradeDecisionAlertPayload & {
  priceConviction?: number;
  priceConvictionBeforeDecay?: number;
  optionConviction?: number;
  weightedBaseConviction?: number;
  convictionBonuses?: Array<{ label: string; points: number }>;
  convictionThresholds?: { enter?: number };
  priceAction: TradeDecisionAlertPayload['priceAction'] & {
    components?: Record<string, { score: number }>;
    primaryTimeframe?: string;
    timeframeScores?: Record<string, number>;
    confluence?: { aligned?: number };
    overallSignal?: {
      action: string;
      confidence: number;
      structuralAction?: string;
      vetoReason?: string;
    };
  };
  optionFlow?: { bias: string; overallScore?: number; components?: unknown[] };
  optionOverlay?: {
    status: OptionOverlayStatus;
    ageMs: number | null;
    ivRegime?: string;
  };
  risk?: { suggestedRiskPercent?: number; notes?: string[] };
  _debug?: { rawPrice?: PriceActionResponse };
};

function shouldExecuteAutoEntry(fastify: FastifyInstance): boolean {
  if (isIndianMarketOpen()) return true;
  return fastify.preferences.getAutoEntry().dryRun;
}

async function buildDeckDecision(
  fastify: FastifyInstance,
  symbol: string,
  style: TradingStyle,
  vetoMode: VetoMode,
): Promise<DeckDecision> {
  const priceData = await computePriceAction(fastify, {
    symbol,
    tradingStyle: style,
    vetoMode,
  });
  if (!priceData) {
    throw new Error('Price action unavailable');
  }

  // Read the option-chain overlay non-blockingly. A fresh snapshot blends into
  // conviction; a stale/missing one degrades to PA-only AND triggers a
  // fire-and-forget refresh so the next tick can blend. The fetch never sits on
  // this code path, so blending cannot delay or slow the signal.
  const overlay = readOptionOverlay(symbol, style, Date.now());
  const optionMetrics = overlay.metrics;
  if (overlay.status !== 'fresh') {
    void refreshOptionOverlay(fastify, symbol, style).catch(() => undefined);
  }

  const paDecision = computePaDecision(fastify, priceData, style, {
    vetoMode,
    optionMetrics,
  });
  const optionConviction = optionMetrics ? paDecision.optionConviction : 0;
  const components: Record<string, { score: number }> = {
    '5m': { score: priceData.timeframeScores['5m'] },
    '15m': { score: priceData.timeframeScores['15m'] },
    '1h': { score: priceData.timeframeScores['1h'] },
    mtfScore: { score: priceData.confluence.mtfScore },
    alignment: { score: priceData.confluence.aligned },
    higherTFConfirmation: {
      score: priceData.confluence.higherTimeframeConfirmation ? 1 : 0,
    },
  };

  return {
    symbol,
    tradingStyle: style,
    lastPrice: priceData.lastPrice,
    action: paDecision.action,
    bias: paDecision.bias,
    conviction: paDecision.conviction,
    weightedBaseConviction: paDecision.weightedBaseConviction,
    convictionBonuses: paDecision.convictionBonuses,
    priceConviction: paDecision.priceConviction,
    priceConvictionBeforeDecay: paDecision.priceConvictionBeforeDecay,
    optionConviction,
    recommendation: paDecision.recommendation,
    humanSummary: paDecision.humanSummary,
    tradeGuidance: buildTradeGuidanceForPa(
      paDecision.conviction,
      style,
      paDecision.action,
    ),
    priceAction: {
      action: priceData.signal.action as TradeDecisionAlertPayload['priceAction']['action'],
      confidence: priceData.signal.confidence,
      structuralAction: priceData.signal.structuralAction as TradeDecisionAlertPayload['priceAction']['action'],
      vetoReason: priceData.signal.vetoReason,
      confidenceBeforeDecay: paDecision.priceConvictionBeforeDecay,
      components,
      primaryTimeframe: priceData.primaryTimeframe,
      timeframeScores: priceData.timeframeScores,
      confluence: priceData.confluence,
      overallSignal: priceData.signal,
      levels: priceData.levels,
      atr: priceData.atr,
      adx: priceData.adx,
      momentum: priceData.momentum,
      structureElements: priceData.structureElements,
      candlestick: priceData.candlestick,
    } as DeckDecision['priceAction'],
    // Option-structure recommendations (IV-aware when the overlay is fresh).
    // These feed the Strategy tab's "Options" view and are deliberately
    // distinct from the PA structural checklist (priceActionStrategies), which
    // the strategy payload derives separately — fixing the duplicate tabs.
    recommendedStrategies: buildOptionRecommendedStrategies(
      paDecision.action,
      paDecision.conviction,
      optionMetrics?.ivRegime,
      optionMetrics?.bias,
    ),
    risk: {
      suggestedRiskPercent: paDecision.conviction >= 60 ? 1 : 0.5,
      notes: [
        optionMetrics
          ? 'Blended PA + option-flow sizing — adjust to your capital and risk rules.'
          : 'PA-only sizing — adjust to your capital and risk rules.',
      ],
    },
    tradeSetup: priceData.tradeSetup ?? null,
    momentumDecayPercent: priceData.momentumDecay?.decayPercent ?? null,
    optionFlow: optionMetrics
      ? {
          bias: optionMetrics.bias,
          overallScore: optionMetrics.score,
          components: optionMetrics.components
            ? [optionMetrics.components]
            : [],
        }
      : {
          bias: 'neutral',
          overallScore: 0,
          components: [],
        },
    optionOverlay: {
      status: overlay.status,
      ageMs: overlay.ageMs,
      ivRegime: optionMetrics?.ivRegime,
    },
    convictionThresholds: getStyleScoringConfig(style).convictionThreshold,
    _debug: { rawPrice: priceData },
  };
}

function buildLaneMeta(
  decision: DeckDecision,
  gauges: DeckGauges,
): {
  lanes: DeckLiveStreamTick['lanes'];
  weightedBaseConviction: number;
  convictionBonuses: DeckLiveStreamTick['convictionBonuses'];
} {
  const priceActionPercent = gauges.priceAction.percent ?? 0;
  const weightedBase =
    decision.weightedBaseConviction ?? Math.round(decision.conviction ?? 0);
  const optionFresh = decision.optionOverlay?.status === 'fresh';
  const optionPercent = optionFresh
    ? Math.round(decision.optionConviction ?? 0)
    : 0;
  // When option flow is blended in, the combined lane reflects the engine's
  // final (blended) conviction; PA-only keeps the prior behaviour.
  const combinedPercent = optionFresh
    ? Math.round(decision.conviction ?? priceActionPercent)
    : Math.round(priceActionPercent || weightedBase);
  return {
    lanes: {
      optionPercent,
      priceActionPercent,
      combinedPercent,
    },
    weightedBaseConviction: weightedBase,
    convictionBonuses: decision.convictionBonuses ?? [],
  };
}

function buildStreamTickParts(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    style: TradingStyle;
    vetoMode: VetoMode;
    decision: DeckDecision;
    openPositions?: DeckOpenPositionsPayload;
    managementContext?: PositionManagementContext;
  },
): DeckLiveStreamTick {
  const optionOverlayFresh = params.decision.optionOverlay?.status === 'fresh';
  const flowMode: FlowMode = optionOverlayFresh ? 'blend' : 'pa-only';
  const optionConvictionPct = optionOverlayFresh
    ? params.decision.optionConviction ?? 0
    : 0;
  const optionBias = optionOverlayFresh
    ? params.decision.optionFlow?.bias ?? 'neutral'
    : 'neutral';
  const optionOverallScore = optionOverlayFresh
    ? params.decision.optionFlow?.overallScore ?? 0
    : 0;
  const primaryTf = primaryTimeframeForStyle(params.style);
  const primaryScore =
    params.decision.priceAction.components?.[primaryTf]?.score ?? 0;
  const rawPrice = params.decision._debug?.rawPrice;
  const paLedger = buildPaConvictionLedger({
    confidence: params.decision.conviction,
    confidenceBeforeDecay: params.decision.priceConvictionBeforeDecay,
    convictionBonuses: params.decision.convictionBonuses,
    baseConviction: params.decision.weightedBaseConviction,
    momentumDecayPercent: rawPrice?.momentumDecay?.decayPercent ?? null,
  });
  const priceConviction = paLedger.entryConviction;
  const gauges = buildDeckGauges({
    action: params.decision.action,
    optionConviction: optionConvictionPct,
    optionBias,
    optionOverallScore,
    priceConviction,
    priceConvictionBeforeDecay:
      params.decision.priceConvictionBeforeDecay,
    primaryScore,
    hasMomentumDecay: Boolean(params.decision.momentumDecayPercent),
  });
  const laneMeta = buildLaneMeta(params.decision, gauges);
  const indexSymbol = params.decision.symbol || params.symbol;
  const liveQuote = resolveLiveIndexQuote(
    fastify,
    indexSymbol,
    params.decision.lastPrice,
  );
  const liveLastPrice = liveQuote.ltp;
  const spotSeries =
    fastify.fyersMarketStream?.getSpotSeries(indexSymbol) ?? [];
  const aligned = resolveDeckAlignmentCount(params.decision);
  const marketRegime = resolveDeckMarketRegime({
    symbol: indexSymbol,
    tradingStyle: params.style,
    mtfScore: rawPrice?.confluence?.mtfScore,
    aligned,
    confluenceContext: rawPrice?.confluenceContext,
    flowMode,
    vetoMode: params.vetoMode,
  });

  const paExtras = extractDeckPaExtras(params.decision);
  const calculatedAt = new Date().toISOString();
  return {
    type: 'tick',
    asOf: calculatedAt,
    signalCalculatedAt: calculatedAt,
    tfAligned: aligned,
    tfAlignedTotal: 3,
    marketRegime,
    marketOpen: isIndianMarketOpen(),
    action: params.decision.action,
    bias: params.decision.bias,
    conviction: params.decision.conviction,
    weightedBaseConviction: laneMeta.weightedBaseConviction,
    convictionBonuses: laneMeta.convictionBonuses,
    paConvictionBonuses: paLedger.bonuses,
    paBaseConviction: paLedger.baseConviction,
    entryThreshold:
      params.decision.convictionThresholds?.enter ??
      getStyleScoringConfig(params.style).convictionThreshold.enter,
    lastPrice: liveLastPrice,
    dayChange: liveQuote.dayChange,
    dayChangePct: liveQuote.dayChangePct,
    chartVetoed: Boolean(params.decision.priceAction.overallSignal?.vetoReason),
    gauges,
    lanes: laneMeta.lanes,
    spotSeries,
    ...extractComponentGauges(params.decision),
    paDrilldown: extractPaDrilldown(params.decision),
    flowMode,
    vetoBreakup: extractVetoBreakup(params.decision, params.vetoMode, flowMode),
    vetoReason: params.decision.priceAction.overallSignal?.vetoReason,
    structuralAction: params.decision.priceAction.overallSignal?.structuralAction,
    openPositions: params.openPositions,
    openPositionsLtpOnly: Boolean(params.openPositions?.entries?.length),
    managementContext: params.managementContext,
    patternInsights: extractPatternInsightsFromPriceAction(
      rawPrice,
      params.style,
    ),
    chartPatternNeckline:
      rawPrice?.confluenceContext?.chartPatternNeckline ?? undefined,
    strategyRecommendation: extractDeckStrategyPayload(params.decision),
    tradeSetup: paExtras.tradeSetup,
    componentSignals: paExtras.componentSignals,
    primaryTimeframe: paExtras.primaryTimeframe,
  };
}

async function buildDeckManagementContextFromPositions(
  fastify: FastifyInstance,
  decision: DeckDecision,
  style: TradingStyle,
  indexSymbol: string,
  positions: OpenPositionMonitorContext[],
  options?: { executeAutoExit?: boolean; executeAutoEntry?: boolean },
): Promise<PositionManagementContext> {
  const watched = positions.filter((p) => p.indexSymbol === indexSymbol);
  const ctx = buildOpenPositionContextFromPositions(watched);
  const base = {
    hasOpenPosition: ctx.count > 0,
    heldDirection: ctx.heldDirection,
    isMixedDirections: ctx.isMixedDirections,
    count: ctx.count,
  };
  const exitPref = fastify.preferences.getAutoExit();
  const entryPref = fastify.preferences.getAutoEntry();
  const liveLastPrice = resolveLiveIndexPrice(
    fastify,
    indexSymbol,
    decision.lastPrice,
  );
  const decisionSlice = {
    action: decision.action,
    conviction: decision.conviction,
    lastPrice: liveLastPrice,
    tradeSetup: decision.tradeSetup,
    tradeGuidance: {
      thresholdsForThisStyle: {
        enter:
          decision.convictionThresholds?.enter ??
          getStyleScoringConfig(style).convictionThreshold.enter,
      },
    },
    priceAction: decision.priceAction,
    momentumDecayPercent: decision.momentumDecayPercent,
    _debug: decision._debug,
  };

  if (ctx.count > 0 && ctx.heldDirection) {
    const priceData = decision._debug?.rawPrice;
    if (!priceData) {
      const managementContext: PositionManagementContext = { ...base };
      await attachAutoExitGuard({
        fastify,
        indexSymbol,
        decision: decisionSlice,
        managementContext,
        pref: exitPref,
        execute: false,
      });
      await attachAutoEntryGuard({
        fastify,
        indexSymbol,
        decision: decisionSlice,
        managementContext,
        pref: entryPref,
        style,
        execute: false,
        resolvePresetSignal: resolveAutoEntryPresetSignal,
      });
      return managementContext;
    }

    const entrySpot = await resolveHeldEntrySpot(fastify, {
      indexSymbol,
      heldDirection: ctx.heldDirection,
      positionSymbols: watched.map((position) => position.symbol),
      tradingStyle: style,
    });
    const advice = computeManagementAdvice(
      ctx,
      toManagementDecisionPayload(decision),
      { ...priceData, lastPrice: liveLastPrice },
      style,
      { entrySpot },
    );
    const managementContext: PositionManagementContext = {
      hasOpenPosition: true,
      heldDirection: ctx.heldDirection,
      isMixedDirections: ctx.isMixedDirections,
      count: ctx.count,
      advice,
      note: advice.headline,
      health: advice.positionHealth,
    };
    await attachAutoExitGuard({
      fastify,
      indexSymbol,
      decision: decisionSlice,
      managementContext,
      pref: exitPref,
      entrySpot,
      execute: options?.executeAutoExit === true,
    });
    await attachAutoEntryGuard({
      fastify,
      indexSymbol,
      decision: decisionSlice,
      managementContext,
      pref: entryPref,
      style,
      execute: false,
      resolvePresetSignal: resolveAutoEntryPresetSignal,
    });
    return managementContext;
  }

  const emptyContext: PositionManagementContext = {
    ...base,
    hasOpenPosition: false,
  };
  await attachAutoExitGuard({
    fastify,
    indexSymbol,
    decision: decisionSlice,
    managementContext: emptyContext,
    pref: exitPref,
    execute: false,
  });
  await attachAutoEntryGuard({
    fastify,
    indexSymbol,
    decision: decisionSlice,
    managementContext: emptyContext,
    pref: entryPref,
    style,
    execute: options?.executeAutoEntry === true,
    resolvePresetSignal: resolveAutoEntryPresetSignal,
  });
  return emptyContext;
}

async function buildPositionsBundle(
  fastify: FastifyInstance,
  indexSymbol: string,
  decision: DeckDecision,
  style: TradingStyle,
  options?: { executeAutoExit?: boolean; executeAutoEntry?: boolean },
): Promise<{
  openPositions: DeckOpenPositionsPayload;
  managementContext: PositionManagementContext;
}> {
  const positions = await fetchOpenIndexOptionPositions(fastify, [indexSymbol]);
  const [openPositions, managementContext] = await Promise.all([
    buildDeckOpenPositions(fastify, indexSymbol, positions),
    buildDeckManagementContextFromPositions(
      fastify,
      decision,
      style,
      indexSymbol,
      positions,
      options,
    ),
  ]);

  const paTrigger = [
    decision.action,
    decision.humanSummary || decision.recommendation,
  ]
    .filter(Boolean)
    .join(' — ');
  const optionBias = decision.optionFlow?.bias;
  const optionTrigger =
    optionBias && optionBias !== 'NEUTRAL'
      ? `Option flow ${optionBias}${decision.optionConviction ? ` (${Math.round(decision.optionConviction)}%)` : ''}`
      : undefined;

  void syncTradeJournalFromPositions(fastify, {
    symbol: indexSymbol,
    tradingStyle: style,
    entries: openPositions.entries.map((e) => ({
      symbol: e.symbol,
      direction: e.direction,
      indexLabel: e.indexLabel,
    })),
    paTrigger,
    optionTrigger,
  }).catch((err) => {
    fastify.log.warn({ err }, 'trade journal sync failed');
  });

  return { openPositions, managementContext };
}

function resolveDeckTimelineDays(style: TradingStyle): number {
  if (style === TradingStyle.Scalper) {
    return DECK_LIVE_TIMELINE.DAYS_BY_STYLE.SCALPER;
  }
  if (style === TradingStyle.Positional) {
    return DECK_LIVE_TIMELINE.DAYS_BY_STYLE.POSITIONAL;
  }
  return DECK_LIVE_TIMELINE.DAYS_BY_STYLE.INTRADAY;
}

async function fetchTimeline(
  fastify: FastifyInstance,
  symbol: string,
  style: TradingStyle,
): Promise<TechnicalAnalysisTimelineResponse | null> {
  try {
    return await computeTechnicalAnalysisTimeline(fastify, {
      symbol,
      tradingStyle: style,
      days: resolveDeckTimelineDays(style),
      maxPoints: DECK_LIVE_TIMELINE.MAX_POINTS,
      includeCandles: true,
    });
  } catch (err) {
    fastify.log.warn({ err }, 'deck timeline fetch failed');
    return null;
  }
}

function mapSpotCandles(
  timeline: TechnicalAnalysisTimelineResponse | null,
): {
  c5: DeckCandlePoint[];
  c15: DeckCandlePoint[];
  c1h: DeckCandlePoint[];
} {
  const c5 = timeline?.spotCandles?.['5m'] ?? [];
  const c15 = timeline?.spotCandles?.['15m'] ?? [];
  const c1h = timeline?.spotCandles?.['1h'] ?? [];
  return { c5, c15, c1h };
}

/** Short TTL cache for heavy live deck payloads to speed first paint and concurrent loads (enrichment + SSE + style changes). */
const DECK_LIVE_PAYLOAD_TTL_MS = 10_000;
const deckLivePayloadCache = new Map<
  string,
  { value: DeckLivePayload; at: number }
>();
const deckLivePayloadInFlight = new Map<string, Promise<DeckLivePayload>>();

function makeDeckLiveCacheKey(
  symbol: string,
  style: TradingStyle,
  vetoMode: VetoMode,
): string {
  return `${symbol.trim()}:${style}:${vetoMode}`;
}

export function invalidateDeckLivePayloadCache(symbol?: string): void {
  if (!symbol) {
    deckLivePayloadCache.clear();
    return;
  }
  const prefix = `${symbol.trim()}:`;
  for (const k of Array.from(deckLivePayloadCache.keys())) {
    if (k.startsWith(prefix)) {
      deckLivePayloadCache.delete(k);
    }
  }
}

export async function buildDeckLiveStreamTick(
  fastify: FastifyInstance,
  params: { symbol: string; tradingStyle?: string; vetoMode?: VetoMode },
  cachedOpenPositions?: DeckOpenPositionsPayload,
): Promise<DeckLiveStreamTick> {
  const style = parseTradingStyle(params.tradingStyle);
  const vetoMode = params.vetoMode ?? fastify.preferences.getSettings().vetoMode;
  const decision = await buildDeckDecision(
    fastify,
    params.symbol.trim(),
    style,
    vetoMode,
  );
  const indexSymbol = decision.symbol || params.symbol.trim();
  const openPositions =
    cachedOpenPositions ??
    (await buildDeckOpenPositions(fastify, indexSymbol)).entries.length
      ? refreshDeckOpenPositionsLtp(
          fastify,
          await buildDeckOpenPositions(fastify, indexSymbol),
        )
      : await buildDeckOpenPositions(fastify, indexSymbol);

  const { managementContext } = await buildPositionsBundle(
    fastify,
    indexSymbol,
    decision,
    style,
    {
      executeAutoExit: isIndianMarketOpen(),
      executeAutoEntry: shouldExecuteAutoEntry(fastify),
    },
  );

  return buildStreamTickParts(fastify, {
    symbol: params.symbol.trim(),
    style,
    vetoMode,
    decision,
    openPositions,
    managementContext,
  });
}

export async function buildDeckLivePayload(
  fastify: FastifyInstance,
  params: { symbol: string; tradingStyle?: string; vetoMode?: VetoMode },
): Promise<DeckLivePayload> {
  const style = parseTradingStyle(params.tradingStyle);
  const vetoMode = params.vetoMode ?? fastify.preferences.getSettings().vetoMode;
  const key = makeDeckLiveCacheKey(params.symbol, style, vetoMode);
  const now = Date.now();

  // Serve from short cache for first paint speed (concurrent fast/enrichment/SSE + style changes)
  const cached = deckLivePayloadCache.get(key);
  if (cached && now - cached.at < DECK_LIVE_PAYLOAD_TTL_MS) {
    return cached.value;
  }

  // Dedup concurrent first-paint computes for the same key
  const inFlight = deckLivePayloadInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const computePromise = (async () => {
    const [decision, timeline] = await Promise.all([
      buildDeckDecision(fastify, params.symbol.trim(), style, vetoMode),
      fetchTimeline(fastify, params.symbol.trim(), style),
    ]);
    const indexSymbol = decision.symbol || params.symbol.trim();
    const lotMeta = FYERS_OPTION_INDEX_SYMBOLS.find((s) => s.symbol === indexSymbol);
    const { openPositions, managementContext } = await buildPositionsBundle(
      fastify,
      indexSymbol,
      decision,
      style,
      {
      executeAutoExit: isIndianMarketOpen(),
      executeAutoEntry: shouldExecuteAutoEntry(fastify),
    },
    );
    const tick = buildStreamTickParts(fastify, {
      symbol: params.symbol.trim(),
      style,
      vetoMode,
      decision,
      openPositions,
      managementContext,
    });
    const points = timeline?.points ?? [];
    const streamSpotSeries =
      fastify.fyersMarketStream?.getSpotSeries(indexSymbol) ?? [];
    const spotSeries = mergeSpotSeriesWithStream(
      timelineToSpotSeries(points),
      streamSpotSeries,
    );
    const multiCandles = mapSpotCandles(timeline);

    const payload: DeckLivePayload = {
      mode: 'live',
      symbol: indexSymbol,
      symbolLabel: shortSymbol(indexSymbol),
      lotSize: lotMeta?.lotSize ?? null,
      tradingStyle: String(style),
      vetoMode,
      vetoOff: isVetoOff(vetoMode),
      spotCandles: multiCandles.c5.length
        ? multiCandles.c5
        : spotSeriesToSyntheticCandles(spotSeries),
      spotCandles5m: multiCandles.c5,
      spotCandles15m: multiCandles.c15,
      spotCandles1h: multiCandles.c1h,
      convictionSeries: points.map((p) => ({
        t: p.asOf,
        option: 0,
        priceAction: Math.round(Math.abs(p.mtfScore) * 100),
        combined: p.signal.confidence,
      })),
      markers: timelineMarkers(points),
      events: buildDeckEvents(
        timelineMarkers(points),
        timelineToVetoSeries(points),
      ),
      vetoTimeline: timelineToVetoSeries(points),
      openPositions,
      ...tick,
      spotSeries,
      marketRegime: tick.marketRegime,
    };

    deckLivePayloadCache.set(key, { value: payload, at: Date.now() });
    return payload;
  })().finally(() => {
    deckLivePayloadInFlight.delete(key);
  });

  deckLivePayloadInFlight.set(key, computePromise);
  return computePromise;
}

export async function buildDeckLiveFastPayload(
  fastify: FastifyInstance,
  params: { symbol: string; tradingStyle?: string },
): Promise<DeckLiveStreamTick> {
  return buildDeckLiveStreamTick(fastify, params);
}

export async function buildDeckPositionsLtpPatch(
  fastify: FastifyInstance,
  params: { symbol: string; tradingStyle?: string },
  openPositions: DeckOpenPositionsPayload,
  managementContext?: PositionManagementContext,
): Promise<DeckPositionsLtpPatch> {
  const indexSymbol = params.symbol.trim();
  const refreshed = refreshDeckOpenPositionsLtp(fastify, openPositions);
  const liveQuote = resolveLiveIndexQuote(fastify, indexSymbol, 0);
  const liveLastPrice =
    liveQuote.ltp > 0 ? liveQuote.ltp : null;
  const patchedManagementContext =
    managementContext && liveLastPrice != null
      ? refreshAutoExitGuardDisplay({
          indexSymbol,
          managementContext,
          spot: liveLastPrice,
          pref: fastify.preferences.getAutoExit(),
        })
      : managementContext;
  return {
    type: 'ltp',
    asOf: new Date().toISOString(),
    lastPrice: liveLastPrice,
    dayChange: liveQuote.dayChange,
    dayChangePct: liveQuote.dayChangePct,
    openPositions: refreshed,
    openPositionsLtpOnly: true,
    managementContext: patchedManagementContext,
  };
}

export async function runDeckAutoEntryPoll(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    tradingStyle?: string;
    preloadedPositions?: OpenPositionMonitorContext[];
  },
): Promise<void> {
  if (!fastify.preferences.getAutoEntry().enabled) return;

  const style = parseTradingStyle(params.tradingStyle);
  const indexSymbol = params.symbol.trim();
  if (
    (fastify.deckStreamHub?.getSubscriberCount({
      symbol: indexSymbol,
      tradingStyle: String(style),
    }) ?? 0) > 0
  ) {
    return;
  }

  const vetoMode = fastify.preferences.getSettings().vetoMode;
  const decision = await buildDeckDecision(
    fastify,
    indexSymbol,
    style,
    vetoMode,
  );
  const allIndexSymbols = FYERS_OPTION_INDEX_SYMBOLS.map((row) => row.symbol);
  const positions =
    params.preloadedPositions ??
    (await fetchOpenIndexOptionPositions(fastify, allIndexSymbols));
  await buildDeckManagementContextFromPositions(
    fastify,
    decision,
    style,
    indexSymbol,
    positions,
    {
      executeAutoExit: false,
      executeAutoEntry: shouldExecuteAutoEntry(fastify),
    },
  );
}

export async function runDeckAutoExitPoll(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    tradingStyle?: string;
    preloadedPositions?: OpenPositionMonitorContext[];
  },
): Promise<void> {
  if (!fastify.preferences.getAutoExit().enabled) return;

  const style = parseTradingStyle(params.tradingStyle);
  const indexSymbol = params.symbol.trim();
  if (
    (fastify.deckStreamHub?.getSubscriberCount({
      symbol: indexSymbol,
      tradingStyle: String(style),
    }) ?? 0) > 0
  ) {
    return;
  }

  const vetoMode = fastify.preferences.getSettings().vetoMode;
  const decision = await buildDeckDecision(
    fastify,
    indexSymbol,
    style,
    vetoMode,
  );
  const allIndexSymbols = FYERS_OPTION_INDEX_SYMBOLS.map((row) => row.symbol);
  const positions =
    params.preloadedPositions ??
    (await fetchOpenIndexOptionPositions(fastify, allIndexSymbols));
  await buildDeckManagementContextFromPositions(
    fastify,
    decision,
    style,
    indexSymbol,
    positions,
    {
      executeAutoExit: isIndianMarketOpen(),
      executeAutoEntry: shouldExecuteAutoEntry(fastify),
    },
  );
}

export async function buildDeckPositionsUpdate(
  fastify: FastifyInstance,
  params: { symbol: string; tradingStyle?: string },
): Promise<DeckPositionsUpdate> {
  const style = parseTradingStyle(params.tradingStyle);
  const vetoMode = fastify.preferences.getSettings().vetoMode;
  const decision = await buildDeckDecision(
    fastify,
    params.symbol.trim(),
    style,
    vetoMode,
  );
  const indexSymbol = decision.symbol || params.symbol.trim();
  const bundle = await buildPositionsBundle(
    fastify,
    indexSymbol,
    decision,
    style,
    {
      executeAutoExit: isIndianMarketOpen(),
      executeAutoEntry: shouldExecuteAutoEntry(fastify),
    },
  );
  return {
    type: 'positions',
    asOf: new Date().toISOString(),
    openPositions: bundle.openPositions,
    managementContext: bundle.managementContext,
  };
}