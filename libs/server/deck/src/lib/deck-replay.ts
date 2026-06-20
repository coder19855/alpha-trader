import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  computePaDecision,
  computePriceAction,
  computeTechnicalAnalysisTimeline,
} from '@alpha-trader/server-analysis';
import {
  FlowMode,
  FYERS_OPTION_INDEX_SYMBOLS,
  getIstSessionClock,
  getStyleScoringConfig,
  TechnicalAnalysisTimelineResponse,
  TradingStyle,
  VetoMode,
} from '@alpha-trader/server-shared';
import { buildDeckGauges } from './deck-gauge.js';
import {
  buildDeckEvents,
  extractComponentGauges,
  extractPaDrilldown,
  extractVetoBreakup,
  patternInsightsFromTimelinePoint,
  spotSeriesToSyntheticCandles,
  syncLastReplayPointToLive,
  timelineMarkers,
  timelineToConvictionSeries,
  timelineToSpotSeries,
  timelineToVetoSeries,
} from './deck-replay-utils.js';
import {
  buildPaRecommendedStrategies,
  buildTradeGuidanceForPa,
  extractDeckStrategyPayload,
} from './deck-strategy.js';
import type { DeckCandlePoint, DeckLivePayload, DeckMarker } from './deck-service.js';

export interface DeckReplayPoint {
  t: number;
  spot: number;
  optionNeedle: number;
  paNeedle: number;
  optionPercent: number;
  paPercent: number;
  conviction: number;
  weightedBaseConviction: number;
  action: string;
  vetoed: boolean;
  vetoReason?: string;
  structuralAction?: string;
  whatIfAction: string;
  whatIfConviction: number;
  paDrilldown: ReturnType<typeof extractPaDrilldown>;
  vetoBreakup: ReturnType<typeof extractVetoBreakup>;
  patternInsights?: ReturnType<typeof patternInsightsFromTimelinePoint>;
  chartPatternNeckline?: number;
  liveSynced?: boolean;
}

export interface DeckTradeMarker {
  t: number;
  symbol: string;
  pnlInr: number;
  verdict?: string;
  label: string;
}

export interface DeckReplayPayload {
  mode: 'replay';
  symbol: string;
  symbolLabel: string;
  lotSize?: number | null;
  tradingStyle: string;
  sessionDate: string;
  entryThreshold: number;
  gauges: ReturnType<typeof buildDeckGauges>;
  replayPoints: DeckReplayPoint[];
  spotSeries: Array<{ t: number; v: number }>;
  spotCandles: DeckCandlePoint[];
  spotCandles5m: DeckCandlePoint[];
  spotCandles15m: DeckCandlePoint[];
  spotCandles1h: DeckCandlePoint[];
  pnlSeries: Array<{ t: number; v: number }>;
  trades: DeckTradeMarker[];
  markers: DeckMarker[];
  events: ReturnType<typeof buildDeckEvents>;
  optionComponents: ReturnType<typeof extractComponentGauges>['optionComponents'];
  optionComponentsNote: string;
  vetoTimeline: ReturnType<typeof timelineToVetoSeries>;
  vetoMode: VetoMode;
  flowMode: FlowMode;
  vetoBreakup: ReturnType<typeof extractVetoBreakup>;
  patternInsights: ReturnType<typeof patternInsightsFromTimelinePoint>;
  chartSessionLabel: string;
  pnlNote?: string;
  managementContext: {
    hasOpenPosition: false;
    note: string;
  };
  openPositions: {
    asOf: string;
    entries: [];
    note: string;
  };
  strategyRecommendation?: ReturnType<typeof extractDeckStrategyPayload>;
}

export interface DeckReplayTradesPayload {
  trades: DeckTradeMarker[];
  pnlSeries: Array<{ t: number; v: number }>;
  pnlNote?: string;
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

function resolveLiveIndexPrice(
  fastify: FastifyInstance,
  indexSymbol: string,
  fallback: number,
): number {
  const streamed = fastify.fyersMarketStream?.getIndexLtp(indexSymbol);
  return streamed ?? fallback;
}

function mapSpotCandles(timeline: TechnicalAnalysisTimelineResponse | null): {
  c5: DeckCandlePoint[];
  c15: DeckCandlePoint[];
  c1h: DeckCandlePoint[];
} {
  return {
    c5: timeline?.spotCandles?.['5m'] ?? [],
    c15: timeline?.spotCandles?.['15m'] ?? [],
    c1h: timeline?.spotCandles?.['1h'] ?? [],
  };
}

async function buildReplayDecision(
  fastify: FastifyInstance,
  symbol: string,
  style: TradingStyle,
  vetoMode: VetoMode,
) {
  const priceData = await computePriceAction(fastify, {
    symbol,
    tradingStyle: style,
    vetoMode,
  });
  if (!priceData) throw new Error('Price action unavailable');

  const paDecision = computePaDecision(fastify, priceData, style, { vetoMode });
  const primaryTf = primaryTimeframeForStyle(style);
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

  const action = paDecision.action;
  return {
    symbol,
    bias: paDecision.bias,
    action,
    conviction: paDecision.conviction,
    recommendation: paDecision.recommendation,
    humanSummary: paDecision.humanSummary,
    tradeGuidance: buildTradeGuidanceForPa(paDecision.conviction, style, action),
    recommendedStrategies: buildPaRecommendedStrategies(action, paDecision.conviction),
    weightedBaseConviction: paDecision.weightedBaseConviction,
    priceConviction: paDecision.priceConviction,
    priceConvictionBeforeDecay: paDecision.priceConvictionBeforeDecay,
    lastPrice: priceData.lastPrice,
    momentumDecayPercent: priceData.momentumDecay?.decayPercent ?? null,
    convictionThresholds: getStyleScoringConfig(style).convictionThreshold,
    priceAction: {
      components,
      primaryTimeframe: primaryTf,
      timeframeScores: priceData.timeframeScores,
      confluence: priceData.confluence,
      overallSignal: priceData.signal,
      levels: priceData.levels,
      atr: priceData.atr,
      adx: priceData.adx,
      momentum: priceData.momentum,
      structureElements: priceData.structureElements,
      candlestick: priceData.candlestick,
    },
    optionFlow: { bias: 'neutral', overallScore: 0, components: [] },
    _debug: { rawPrice: priceData },
  };
}

export async function buildDeckReplayPayload(
  fastify: FastifyInstance,
  params: { symbol: string; tradingStyle?: string; sessionDate?: string },
): Promise<DeckReplayPayload> {
  const style = parseTradingStyle(params.tradingStyle);
  const { sessionDate: todaySessionDate } = getIstSessionClock(
    Date.now(),
    'Asia/Kolkata',
  );
  const date = params.sessionDate ?? todaySessionDate;
  const vetoMode = fastify.preferences.getSettings().vetoMode;
  const flowMode: FlowMode = 'pa-only';
  const sessionEndIso = `${date}T15:30:00+05:30`;

  const [decision, timeline] = await Promise.all([
    buildReplayDecision(fastify, params.symbol.trim(), style, vetoMode),
    computeTechnicalAnalysisTimeline(fastify, {
      symbol: params.symbol.trim(),
      tradingStyle: style,
      sessionOnly: true,
      to: sessionEndIso,
      includeCandles: true,
    }).catch((err) => {
      fastify.log.warn({ err }, 'replay timeline fetch failed');
      return null;
    }),
  ]);

  const primaryTf = primaryTimeframeForStyle(style);
  const primaryScore = decision.priceAction.components[primaryTf]?.score ?? 0;
  const gauges = buildDeckGauges({
    action: decision.action as 'CE-BUY' | 'PE-BUY' | 'NO-TRADE' | 'NEUTRAL',
    optionConviction: 0,
    optionBias: 'neutral',
    optionOverallScore: 0,
    priceConviction: decision.priceConviction ?? decision.conviction,
    priceConvictionBeforeDecay: decision.priceConvictionBeforeDecay,
    primaryScore,
    hasMomentumDecay: Boolean(decision.momentumDecayPercent),
  });

  const points = timeline?.points ?? [];
  let replayPoints = timelineToConvictionSeries(
    points,
    style,
    [],
    vetoMode,
  ) as DeckReplayPoint[];

  const isCurrentSession = date === todaySessionDate;
  if (isCurrentSession && replayPoints.length > 0) {
    const indexSymbol = decision.symbol || params.symbol.trim();
    const liveSpot = resolveLiveIndexPrice(
      fastify,
      indexSymbol,
      decision.lastPrice,
    );
    replayPoints = syncLastReplayPointToLive(
      replayPoints,
      decision,
      gauges,
      vetoMode,
      liveSpot,
    ) as DeckReplayPoint[];
  }

  const multiCandles = mapSpotCandles(timeline);
  const spotSeries = timelineToSpotSeries(points);
  const indexSymbol = decision.symbol || params.symbol.trim();
  const entryThreshold =
    decision.convictionThresholds?.enter ??
    getStyleScoringConfig(style).convictionThreshold.enter;
  const lastPoint = points[points.length - 1];

  const lotMeta = FYERS_OPTION_INDEX_SYMBOLS.find((s) => s.symbol === indexSymbol);
  return {
    mode: 'replay',
    symbol: indexSymbol,
    symbolLabel: shortSymbol(indexSymbol),
    lotSize: lotMeta?.lotSize ?? null,
    tradingStyle: String(style),
    sessionDate: date,
    entryThreshold,
    gauges,
    replayPoints,
    spotSeries,
    spotCandles: multiCandles.c5.length
      ? multiCandles.c5
      : spotSeriesToSyntheticCandles(spotSeries),
    spotCandles5m: multiCandles.c5,
    spotCandles15m: multiCandles.c15,
    spotCandles1h: multiCandles.c1h,
    pnlSeries: [],
    trades: [],
    markers: timelineMarkers(points),
    events: buildDeckEvents(
      timelineMarkers(points),
      timelineToVetoSeries(points),
      [],
    ),
    optionComponents: extractComponentGauges(decision).optionComponents,
    optionComponentsNote:
      'PA-only mode — option lane hidden; scrub updates price-action components per minute.',
    vetoTimeline: timelineToVetoSeries(points),
    vetoMode,
    flowMode,
    vetoBreakup: extractVetoBreakup(decision, vetoMode, flowMode),
    patternInsights: lastPoint
      ? patternInsightsFromTimelinePoint(lastPoint)
      : [],
    chartSessionLabel: '09:15–15:30 IST',
    pnlNote: 'Loading session PnL from Fyers tradebook…',
    managementContext: {
      hasOpenPosition: false,
      note: 'Replay — historical view. Live position health is not applicable.',
    },
    openPositions: {
      asOf: new Date().toISOString(),
      entries: [],
      note: 'Open positions hidden in replay (historical session view).',
    },
    strategyRecommendation: extractDeckStrategyPayload(decision, {
      replayNote:
        'Replay — strategy readout reflects the selected session scrub point.',
    }),
  };
}

export async function buildDeckReplayTradesPayload(
  _fastify: FastifyInstance,
  _params: { symbol: string; tradingStyle?: string; sessionDate: string },
): Promise<DeckReplayTradesPayload> {
  return {
    trades: [],
    pnlSeries: [],
    pnlNote:
      'Fills session PnL when closed option trades exist for this date (tradebook integration pending).',
  };
}

export type DeckLiveEnrichmentPayload = Pick<
  DeckLivePayload,
  | 'symbol'
  | 'symbolLabel'
  | 'tradingStyle'
  | 'vetoMode'
  | 'vetoOff'
  | 'spotSeries'
  | 'spotCandles'
  | 'spotCandles5m'
  | 'spotCandles15m'
  | 'spotCandles1h'
  | 'convictionSeries'
  | 'markers'
  | 'events'
  | 'vetoTimeline'
  | 'openPositions'
> & {
  flowMode: FlowMode;
  chartVetoed: boolean;
  patternInsights: ReturnType<typeof patternInsightsFromTimelinePoint>;
  managementContext?: DeckLivePayload['managementContext'];
  marketRegime?: DeckLivePayload['marketRegime'];
};

export async function buildDeckLiveEnrichmentPayload(
  fastify: FastifyInstance,
  params: { symbol: string; tradingStyle?: string },
): Promise<DeckLiveEnrichmentPayload> {
  const { buildDeckLivePayload } = await import('./deck-service.js');
  const full = await buildDeckLivePayload(fastify, params);

  return {
    symbol: full.symbol,
    symbolLabel: full.symbolLabel,
    tradingStyle: full.tradingStyle,
    vetoMode: full.vetoMode,
    vetoOff: full.vetoOff,
    flowMode: 'pa-only',
    chartVetoed: full.chartVetoed,
    spotSeries: full.spotSeries,
    spotCandles: full.spotCandles,
    spotCandles5m: full.spotCandles5m,
    spotCandles15m: full.spotCandles15m,
    spotCandles1h: full.spotCandles1h,
    convictionSeries: full.convictionSeries,
    markers: full.markers,
    events: full.events,
    vetoTimeline: full.vetoTimeline,
    patternInsights: full.patternInsights ?? [],
    openPositions: full.openPositions,
    managementContext: full.managementContext,
    marketRegime: full.marketRegime,
  };
}

export async function buildDeckLiveStreamEnrichment(
  fastify: FastifyInstance,
  params: { symbol: string; tradingStyle?: string },
): Promise<DeckLiveEnrichmentPayload & { type: 'enrichment'; asOf: string }> {
  const enrichment = await buildDeckLiveEnrichmentPayload(fastify, params);
  return {
    type: 'enrichment',
    asOf: new Date().toISOString(),
    ...enrichment,
  };
}