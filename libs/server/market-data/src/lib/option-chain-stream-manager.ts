import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { FyersAPI } from 'fyers-api-v3';
import {
  FYERS_MARKET_STREAM_DEFAULTS,
  TradeSignal,
  TradingStyle,
  OptionChainSignalResponse,
  formatUnknownError,
  isFyersRateLimitError,
  normalizeVetoMode,
  parseFyersOptionSymbolTemplate,
  resolvePaAlignment,
  runDetached,
} from '@alpha-trader/server-shared';
import { BlackScholes } from '@uqee/black-scholes';
import { getQuoteCache } from './quote-cache.js';
import { seedIndexQuotesFromRest } from './seed-index-quotes.js';
import { onQuoteTicksUpdated } from './market-stream-coordinator.js';

export interface OptionChainStreamParams {
  symbol: string;
  tradingStyle?: string;
  paAction?: string;
}

export interface OptionChainStreamSubscriber {
  id: string;
  write: (payload: unknown) => void;
  writeHeartbeat: () => void;
  isClosed: () => boolean;
}

interface BootstrapState {
  loadedAt: number;
  expiryAtMs: number;
  step: number;
  callTemplate: ReturnType<typeof parseFyersOptionSymbolTemplate> | null;
  putTemplate: ReturnType<typeof parseFyersOptionSymbolTemplate> | null;
  rows: FyersAPI.OptionChainData[];
}

interface ChannelState {
  params: OptionChainStreamParams;
  subscribers: Map<string, OptionChainStreamSubscriber>;
  heartbeatTimer: NodeJS.Timeout | null;
  refreshTimer: NodeJS.Timeout | null;
  refreshScheduled: boolean;
  bootstrapInFlight: Promise<void> | null;
  bootstrap: BootstrapState | null;
  lastSnapshot: OptionChainSignalResponse | null;
  lastAtmStrike: number | null;
  lastOptionSymbols: string[];
  /** Back off Fyers REST after rate-limit (429) responses. */
  bootstrapBlockedUntil: number;
}

const PRICER = new BlackScholes();

function normalizeTradingStyle(raw?: string): TradingStyle {
  const style = String(raw || TradingStyle.Intraday).toUpperCase();
  if (style === TradingStyle.Scalper) return TradingStyle.Scalper;
  if (style === TradingStyle.Positional) return TradingStyle.Positional;
  return TradingStyle.Intraday;
}

function medianStep(strikes: number[]): number {
  const sorted = [...new Set(strikes)].sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const diff = sorted[i] - sorted[i - 1];
    if (Number.isFinite(diff) && diff > 0) diffs.push(diff);
  }
  if (!diffs.length) return 50;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] ?? 50;
}

function nearestStrike(strikes: number[], spot: number): number {
  if (!strikes.length) return Math.round(spot / 50) * 50;
  return strikes.reduce((best, strike) =>
    Math.abs(strike - spot) < Math.abs(best - spot) ? strike : best,
  );
}

function yearsToExpiry(expiryAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, (expiryAtMs - nowMs) / (365 * 24 * 60 * 60 * 1000));
}

function resolveOptGreek(
  type: 'call' | 'put',
  underlying: number,
  strike: number,
  price: number,
  time: number,
): {
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
} {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(underlying) || underlying <= 0 || time <= 0) {
    return { iv: null, delta: null, gamma: null, theta: null, vega: null };
  }

  try {
    const sigma = PRICER.sigma({
      price,
      rate: 0.1,
      strike,
      time,
      type,
      underlying,
    });
    const option = PRICER.option({
      rate: 0.1,
      sigma: Number.isFinite(sigma) && sigma > 0 ? sigma : 0.25,
      strike,
      time,
      type,
      underlying,
    });
    return {
      iv: Number.isFinite(sigma) ? sigma * 100 : null,
      delta: Number.isFinite(option.delta) ? option.delta : null,
      gamma: Number.isFinite(option.gamma) ? option.gamma : null,
      theta: Number.isFinite(option.theta) ? option.theta : null,
      vega: Number.isFinite(option.vega) ? option.vega : null,
    };
  } catch {
    return { iv: null, delta: null, gamma: null, theta: null, vega: null };
  }
}

function resolveStrikePlan(
  bootstrap: BootstrapState,
  spot: number,
): { atmStrike: number; rows: FyersAPI.OptionChainData[]; optionSymbols: string[] } {
  const strikes = [...new Set(bootstrap.rows.map((row) => row.strike_price))].sort(
    (a, b) => a - b,
  );
  const atmStrike = nearestStrike(strikes, spot);
  const window = bootstrap.step * 5;
  const rows = bootstrap.rows.filter(
    (row) => row.strike_price >= atmStrike - window && row.strike_price <= atmStrike + window,
  );
  const optionSymbols = rows.map((row) => row.symbol);
  return { atmStrike, rows, optionSymbols };
}

interface ScoreParts {
  oi: number;
  pcr: number;
  skew: number | null;
  iv: number | null;
  pain: number;
  greeks: number | null;
  vix: number;
  trend: number;
}

type ExplanationRow = {
  name: string;
  score: number | null;
  interpretation: string;
  meaning: string;
  weightage: number;
};

function clampScore(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function rowsNearStrike(
  chain: FyersAPI.OptionChainData[],
  atm: number,
  span = 5,
): FyersAPI.OptionChainData[] {
  const step = medianStep(chain.map((row) => row.strike_price));
  const min = atm - span * step;
  const max = atm + span * step;
  return chain.filter((row) => row.strike_price >= min && row.strike_price <= max);
}

function computeMaxPain(chain: FyersAPI.OptionChainData[]): number {
  const strikes = [...new Set(chain.map((row) => row.strike_price))].sort(
    (a, b) => a - b,
  );
  if (!strikes.length) return 0;
  let bestStrike = strikes[0];
  let bestPain = Number.POSITIVE_INFINITY;
  for (const test of strikes) {
    let pain = 0;
    for (const row of chain) {
      const oi = row.oi || 0;
      pain +=
        row.option_type === 'CE'
          ? Math.max(0, test - row.strike_price) * oi
          : Math.max(0, row.strike_price - test) * oi;
    }
    if (pain < bestPain) {
      bestPain = pain;
      bestStrike = test;
    }
  }
  return bestStrike;
}

function scoreOiPressure(near: FyersAPI.OptionChainData[]): number {
  let callBuild = 0;
  let putBuild = 0;
  for (const row of near) {
    const ch = row.oich || 0;
    if (row.option_type === 'CE') callBuild += ch;
    else putBuild += ch;
  }
  const total = Math.abs(callBuild) + Math.abs(putBuild);
  return total < 1 ? 0 : clampScore((callBuild - putBuild) / total);
}

function scorePcr(callOi: number, putOi: number): number {
  if (callOi <= 0) return 0;
  const pcr = putOi / callOi;
  if (pcr > 1.35) return clampScore(-(pcr - 1) / 0.8);
  if (pcr < 0.75) return clampScore((1 - pcr) / 0.5);
  return clampScore((1 - pcr) * 0.4);
}

function scorePain(spot: number, maxPain: number): number {
  if (!maxPain) return 0;
  const distPct = ((spot - maxPain) / spot) * 100;
  return clampScore(-distPct / 0.8);
}

function scoreSkew(atmCall: FyersAPI.OptionChainData | null, atmPut: FyersAPI.OptionChainData | null): number | null {
  const callIv = atmCall?.greeks?.iv;
  const putIv = atmPut?.greeks?.iv;
  if (callIv == null || putIv == null) return null;
  return clampScore(-(putIv - callIv) / 8);
}

function scoreIv(atmIv: number | null | undefined): number | null {
  if (atmIv == null || !Number.isFinite(atmIv)) return null;
  if (atmIv < 12) return 0.55;
  if (atmIv < 16) return 0.2;
  if (atmIv < 22) return 0;
  if (atmIv < 28) return -0.35;
  return -0.7;
}

function scoreVix(vix: number, norm: (value: number, scale?: number) => number): number {
  if (!Number.isFinite(vix) || vix <= 0) return 0;
  return clampScore(-norm(vix - 16, 8));
}

function scoreGreeks(near: FyersAPI.OptionChainData[]): number | null {
  let netDelta = 0;
  let weight = 0;
  for (const row of near) {
    const delta = row.greeks?.delta;
    if (delta == null) continue;
    const signed = row.option_type === 'PE' ? -Math.abs(delta) : Math.abs(delta);
    const w = Math.max(1, row.oi || 1);
    netDelta += signed * w;
    weight += w;
  }
  if (weight <= 0) return null;
  return clampScore(netDelta / weight / 0.45);
}

function scoreTrend(near: FyersAPI.OptionChainData[]): number {
  let bullish = 0;
  let bearish = 0;
  for (const row of near) {
    const ch = row.oich || 0;
    if (row.option_type === 'CE') {
      if (ch > 0) bullish += ch;
      else bearish += Math.abs(ch);
    } else {
      if (ch > 0) bearish += ch;
      else bullish += Math.abs(ch);
    }
  }
  const total = bullish + bearish;
  return total < 1 ? 0 : clampScore((bullish - bearish) / total);
}

function scoreBias(score: number | null, strong = 0.4): 'bullish' | 'bearish' | 'neutral' {
  if (score == null) return 'neutral';
  if (score >= strong) return 'bullish';
  if (score <= -strong) return 'bearish';
  return 'neutral';
}

function detectIvRegime(atmIvScore: number, vixScore: number, skewScore: number): string {
  if (atmIvScore > 0.3 && vixScore < 0.1) return 'IV Crushed';
  if (atmIvScore < -0.3 && vixScore > 0.2) return 'IV Expanded';
  if (atmIvScore > 0.1) return 'Low IV';
  if (atmIvScore < -0.1) return 'High IV';
  if (Math.abs(skewScore) > 0.2) {
    return skewScore > 0 ? 'Downside IV Elevated (Put Skew)' : 'Upside IV Elevated (Call Skew)';
  }
  return 'Normal IV';
}

function buildExplanationRows(
  parts: ScoreParts,
  weights: Record<keyof ScoreParts, number>,
  utils: {
    interpretRange: (value: number) => string;
    interpretIVRange: (value: number) => string;
  },
): Record<string, ExplanationRow> {
  return {
    oi: {
      name: 'OI Pressure Score',
      score: parts.oi,
      interpretation: utils.interpretRange(parts.oi),
      meaning: utils.interpretRange(parts.oi),
      weightage: weights.oi,
    },
    pcr: {
      name: 'PCR Score',
      score: parts.pcr,
      interpretation: utils.interpretRange(parts.pcr),
      meaning: utils.interpretRange(parts.pcr),
      weightage: weights.pcr,
    },
    skew: {
      name: 'IV Skew Score',
      score: parts.skew,
      interpretation:
        parts.skew == null
          ? 'Insufficient IV skew data'
          : utils.interpretRange(parts.skew),
      meaning:
        parts.skew == null
          ? 'Insufficient IV skew data'
          : utils.interpretRange(parts.skew),
      weightage: weights.skew,
    },
    iv: {
      name: 'ATM IV Score',
      score: parts.iv,
      interpretation:
        parts.iv == null ? 'IV data unavailable' : utils.interpretIVRange(parts.iv),
      meaning:
        parts.iv == null ? 'IV data unavailable' : utils.interpretIVRange(parts.iv),
      weightage: weights.iv,
    },
    pain: {
      name: 'Max Pain Score',
      score: parts.pain,
      interpretation: utils.interpretRange(parts.pain),
      meaning: utils.interpretRange(parts.pain),
      weightage: weights.pain,
    },
    greeks: {
      name: 'Greeks Score',
      score: parts.greeks,
      interpretation:
        parts.greeks == null
          ? 'Greeks unavailable'
          : utils.interpretRange(parts.greeks),
      meaning:
        parts.greeks == null
          ? 'Greeks unavailable'
          : utils.interpretRange(parts.greeks),
      weightage: weights.greeks,
    },
    vix: {
      name: 'VIX Score',
      score: parts.vix,
      interpretation: utils.interpretRange(parts.vix),
      meaning: utils.interpretRange(parts.vix),
      weightage: weights.vix,
    },
    trend: {
      name: 'Trend Confirmation Score',
      score: parts.trend,
      interpretation: utils.interpretRange(parts.trend),
      meaning: utils.interpretRange(parts.trend),
      weightage: weights.trend,
    },
  };
}

function computeConfidence(
  indicators: Record<string, ExplanationRow>,
  signal: TradeSignal,
): { percent: number } {
  const signalBias = scoreBias(
    signal === TradeSignal.BullishTrade
      ? 1
      : signal === TradeSignal.BearishTrade
        ? -1
        : 0,
  );
  let totalWeight = 0;
  let matchingWeight = 0;
  for (const [key, ind] of Object.entries(indicators)) {
    totalWeight += ind.weightage;
    const indicatorBias = scoreBias(ind.score, key === 'iv' || key === 'vix' ? 0.5 : 0.4);
    if (indicatorBias === signalBias) matchingWeight += ind.weightage;
  }
  const confidence = totalWeight === 0 ? 0 : matchingWeight / totalWeight;
  return { percent: Math.round(confidence * 100) };
}

function selectReferenceLeg(
  chain: FyersAPI.OptionChainData[],
  atmStrike: number,
  signal: TradeSignal,
  side?: 'CE' | 'PE',
): FyersAPI.OptionChainData | null {
  const legSide =
    side ?? (signal === TradeSignal.BullishTrade ? 'CE' : signal === TradeSignal.BearishTrade ? 'PE' : 'CE');
  const rows = chain.filter((row) => row.option_type === legSide);
  if (!rows.length) return null;
  return (
    rows.find((row) => row.strike_price === atmStrike) ??
    rows.reduce((best, row) =>
      Math.abs(row.strike_price - atmStrike) < Math.abs(best.strike_price - atmStrike)
        ? row
        : best,
    )
  );
}

export class OptionChainStreamHub {
  private readonly channels = new Map<string, ChannelState>();
  private readonly quoteUnsubscribe: (() => void) | null;

  constructor(
    private readonly fastify: FastifyInstance,
    private readonly log: FastifyBaseLogger,
  ) {
    this.quoteUnsubscribe = onQuoteTicksUpdated((symbols) => {
      this.notifyQuoteTicksUpdated(symbols);
    });
  }

  setPaAction(
    symbol: string,
    tradingStyle: string | TradingStyle,
    paAction: string | undefined,
  ): void {
    const normalizedStyle = normalizeTradingStyle(
      typeof tradingStyle === 'string' ? tradingStyle : tradingStyle,
    );
    const key = `${symbol.trim()}:${normalizedStyle}`;
    const channel = this.channels.get(key);
    if (!channel) return;

    const normalized = paAction?.trim() || undefined;
    if (channel.params.paAction === normalized) return;
    channel.params.paAction = normalized;
    this.scheduleRefresh(channel);
  }

  subscribe(
    params: OptionChainStreamParams,
    subscriber: OptionChainStreamSubscriber,
  ): () => void {
    const normalized: OptionChainStreamParams = {
      symbol: params.symbol.trim(),
      tradingStyle: normalizeTradingStyle(params.tradingStyle),
      paAction: params.paAction?.trim() || undefined,
    };
    const key = `${normalized.symbol}:${normalized.tradingStyle}`;
    let channel = this.channels.get(key);
    if (!channel) {
      channel = {
        params: normalized,
        subscribers: new Map(),
        heartbeatTimer: null,
        refreshTimer: null,
        refreshScheduled: false,
        bootstrapInFlight: null,
        bootstrap: null,
        lastSnapshot: null,
        lastAtmStrike: null,
        lastOptionSymbols: [],
        bootstrapBlockedUntil: 0,
      };
      this.channels.set(key, channel);
      this.startHeartbeat(channel);
      runDetached(this.ensureBootstrap(channel), this.log, 'Option chain bootstrap failed', {
        key,
      });
    } else if (channel.params.paAction !== normalized.paAction) {
      channel.params.paAction = normalized.paAction;
      this.scheduleRefresh(channel);
    }

    channel.subscribers.set(subscriber.id, subscriber);
    if (channel.lastSnapshot) subscriber.write(channel.lastSnapshot);

    return () => {
      channel?.subscribers.delete(subscriber.id);
      if (channel && channel.subscribers.size === 0) {
        this.stopHeartbeat(channel);
        this.stopRefresh(channel);
        this.syncOptionSymbols(channel, []);
        this.channels.delete(key);
      }
    };
  }

  shutdown(): void {
    this.quoteUnsubscribe?.();
    for (const channel of this.channels.values()) {
      this.stopHeartbeat(channel);
      this.stopRefresh(channel);
    }
    this.channels.clear();
  }

  notifyQuoteTicksUpdated(symbols: string[]): void {
    if (!symbols.length) return;
    const unique = [...new Set(symbols.filter(Boolean))];
    for (const channel of this.channels.values()) {
      if (channel.subscribers.size === 0) continue;
      const indexSymbol = channel.params.symbol.trim();
      const relevant =
        unique.includes(indexSymbol) ||
        unique.some((symbol) => channel.lastOptionSymbols.includes(symbol));
      if (!relevant) continue;
      this.scheduleRefresh(channel);
    }
  }

  private startHeartbeat(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.heartbeatTimer) return;
    channel.heartbeatTimer = setInterval(() => {
      for (const [id, subscriber] of channel.subscribers) {
        if (subscriber.isClosed()) {
          channel.subscribers.delete(id);
          continue;
        }
        subscriber.writeHeartbeat();
      }
    }, 15_000);
    channel.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.heartbeatTimer) clearInterval(channel.heartbeatTimer);
    channel.heartbeatTimer = null;
  }

  private stopRefresh(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.refreshTimer) clearTimeout(channel.refreshTimer);
    channel.refreshTimer = null;
    channel.refreshScheduled = false;
    channel.bootstrapInFlight = null;
  }

  private scheduleRefresh(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.refreshScheduled) return;
    channel.refreshScheduled = true;
    channel.refreshTimer = setTimeout(() => {
      channel.refreshScheduled = false;
      runDetached(this.refreshChannel(channel), this.log, 'Option chain refresh failed', {
        symbol: channel.params.symbol,
      });
    }, 120);
    channel.refreshTimer.unref?.();
  }

  private async ensureBootstrap(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    if (channel.bootstrap) return;
    if (channel.bootstrapBlockedUntil > Date.now()) return;
    if (channel.bootstrapInFlight) return channel.bootstrapInFlight;

    const promise = (async () => {
      try {
        await this.bootstrapChannel(channel);
      } catch (err) {
        if (isFyersRateLimitError(err)) {
          channel.bootstrapBlockedUntil = Date.now() + 30_000;
        }
        this.log.warn(
          { err, symbol: channel.params.symbol },
          'Option chain bootstrap failed',
        );
        this.broadcastError(channel, err);
      }
    })().finally(() => {
      if (channel.bootstrapInFlight === promise) {
        channel.bootstrapInFlight = null;
      }
    });
    channel.bootstrapInFlight = promise;
    return promise;
  }

  private async bootstrapChannel(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    const indexSymbol = channel.params.symbol.trim();
    await seedIndexQuotesFromRest(this.fastify, [indexSymbol]);
    const chainRes = await this.fastify.fyers.getOptionChain({
      symbol: indexSymbol,
      strikecount: 12,
      timestamp: '',
      greeks: 0,
    } as FyersAPI.OptionChainRequest);
    if (chainRes.s !== 'ok' || !chainRes.data?.optionsChain?.length) {
      throw new Error('Option chain unavailable from Fyers');
    }

    const chain = chainRes.data.optionsChain;
    const strikes = [...new Set(chain.map((row) => row.strike_price))].sort((a, b) => a - b);
    const step = medianStep(strikes);
    const expiry = chainRes.data.expiryData?.[0];
    const expiryAtMs = expiry?.expiry ? Number(expiry.expiry) * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000;
    const ceTemplate = parseFyersOptionSymbolTemplate(
      chain.find((row) => row.option_type === 'CE')?.symbol ?? '',
    );
    const peTemplate = parseFyersOptionSymbolTemplate(
      chain.find((row) => row.option_type === 'PE')?.symbol ?? '',
    );

    channel.bootstrap = {
      loadedAt: Date.now(),
      expiryAtMs,
      step,
      callTemplate: ceTemplate,
      putTemplate: peTemplate,
      rows: chain,
    };

    await this.refreshChannel(channel);
  }

  private syncOptionSymbols(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
    symbols: string[],
  ): void {
    const next = [...new Set(symbols.filter(Boolean))];
    if (next.length === channel.lastOptionSymbols.length &&
        next.every((symbol, idx) => symbol === channel.lastOptionSymbols[idx])) {
      return;
    }
    channel.lastOptionSymbols = next;
    const marketStream = this.fastify.fyersMarketStream as
      | { syncOptionSymbols?: (indexSymbol: string, symbols: string[]) => void }
      | undefined;
    marketStream?.syncOptionSymbols?.(channel.params.symbol.trim(), next);
  }

  private async refreshChannel(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    try {
      if (channel.subscribers.size === 0) return;
      if (!channel.bootstrap) {
        await this.ensureBootstrap(channel);
        if (!channel.bootstrap) return;
      }

      const indexSymbol = channel.params.symbol.trim();
    let spot =
      this.fastify.fyersMarketStream?.getIndexLtp(indexSymbol) ??
      getQuoteCache().get(indexSymbol)?.ltp ??
      null;
    if (!spot || !Number.isFinite(spot) || spot <= 0) {
      await seedIndexQuotesFromRest(this.fastify, [indexSymbol]);
      spot =
        this.fastify.fyersMarketStream?.getIndexLtp(indexSymbol) ??
        getQuoteCache().get(indexSymbol)?.ltp ??
        null;
      if (!spot || !Number.isFinite(spot) || spot <= 0) return;
    }

    const bootstrap = channel.bootstrap;
    const { atmStrike, rows, optionSymbols } = resolveStrikePlan(bootstrap, spot);

    if (atmStrike !== channel.lastAtmStrike) {
      channel.lastAtmStrike = atmStrike;
      this.syncOptionSymbols(channel, optionSymbols);
    } else if (!channel.lastOptionSymbols.length) {
      this.syncOptionSymbols(channel, optionSymbols);
    }

    const expiryYears = yearsToExpiry(bootstrap.expiryAtMs);
    const synthetic: FyersAPI.OptionChainData[] = rows.map((row) => {
      const quote = getQuoteCache().get(row.symbol);
      const ltp = quote?.ltp ?? row.ltp ?? 0;
      const greeks = resolveOptGreek(
        row.option_type === 'PE' ? 'put' : 'call',
        spot,
        row.strike_price,
        ltp,
        expiryYears,
      );
      return {
        ...row,
        ltp,
        ltpch: quote?.ch ?? row.ltpch ?? 0,
        ltpchp: quote?.chp ?? row.ltpchp ?? 0,
        greeks: {
          delta: greeks.delta ?? 0,
          gamma: greeks.gamma ?? 0,
          theta: greeks.theta ?? 0,
          vega: greeks.vega ?? 0,
          iv: greeks.iv ?? row.greeks?.iv ?? 0,
        },
      };
    });

    const indiaVix =
      this.fastify.fyersMarketStream?.getIndexLtp(
        FYERS_MARKET_STREAM_DEFAULTS.INDIA_VIX_SYMBOL,
      ) ?? 0;
    const supportResistance = (this.fastify as FastifyInstance & {
      supportResistancePlugin?: {
        getSupportResistance: (chain: FyersAPI.OptionChainData[]) => {
          overallSupport: number | null;
          overallResistance: number | null;
          intradaySupport: number | null;
          intradayResistance: number | null;
        } | null;
      };
    }).supportResistancePlugin?.getSupportResistance(synthetic);
    const utils = (this.fastify as FastifyInstance & {
      utilsPlugin: {
        norm: (value: number, scale?: number) => number;
        getScoreWeights: (style: TradingStyle) => Record<keyof ScoreParts, number>;
        calcFinalScore: (parts: ScoreParts, style: TradingStyle) => number;
        mapSignal: (score: number, style: TradingStyle) => TradeSignal;
        interpretRange: (value: number) => string;
        interpretIVRange: (value: number) => string;
      };
    }).utilsPlugin;
    const near = rowsNearStrike(synthetic, atmStrike);
    const callOiTotal = synthetic
      .filter((row) => row.option_type === 'CE')
      .reduce((sum, row) => sum + (row.oi || 0), 0);
    const putOiTotal = synthetic
      .filter((row) => row.option_type === 'PE')
      .reduce((sum, row) => sum + (row.oi || 0), 0);
    const maxPain = computeMaxPain(synthetic);
    const parts: ScoreParts = {
      oi: scoreOiPressure(near),
      pcr: scorePcr(callOiTotal, putOiTotal),
      skew: scoreSkew(
        near.find((row) => row.option_type === 'CE' && row.strike_price === atmStrike) ?? null,
        near.find((row) => row.option_type === 'PE' && row.strike_price === atmStrike) ?? null,
      ),
      iv: scoreIv(
        near.find((row) => row.option_type === 'CE' && row.strike_price === atmStrike)?.greeks?.iv ??
          near.find((row) => row.option_type === 'PE' && row.strike_price === atmStrike)?.greeks?.iv,
      ),
      pain: scorePain(spot, maxPain),
      greeks: scoreGreeks(near),
      vix: scoreVix(indiaVix, utils.norm),
      trend: scoreTrend(near),
    };
    const weights = utils.getScoreWeights(
      channel.params.tradingStyle as TradingStyle,
    ) as Record<keyof ScoreParts, number>;
    const score = utils.calcFinalScore(
      parts as unknown as Record<keyof ScoreParts, number>,
      channel.params.tradingStyle as TradingStyle,
    );
    const signal = utils.mapSignal(
      score,
      channel.params.tradingStyle as TradingStyle,
    );
    const explanations = buildExplanationRows(parts, weights, {
      interpretRange: utils.interpretRange,
      interpretIVRange: utils.interpretIVRange,
    });
    const confidence = computeConfidence(explanations, signal);
    const atmCall = near.find(
      (row) => row.option_type === 'CE' && row.strike_price === atmStrike,
    );
    const atmPut = near.find(
      (row) => row.option_type === 'PE' && row.strike_price === atmStrike,
    );
    const atmIv = atmCall?.greeks?.iv ?? atmPut?.greeks?.iv ?? null;
    const atmGreeks = {
      atmStrike,
      ce: atmCall
        ? {
            strike: atmCall.strike_price,
            ltp: atmCall.ltp ?? 0,
            oi: atmCall.oi ?? 0,
            oiChange: atmCall.oich ?? 0,
            delta: atmCall.greeks?.delta ?? null,
            gamma: atmCall.greeks?.gamma ?? null,
            theta: atmCall.greeks?.theta ?? null,
            vega: atmCall.greeks?.vega ?? null,
            iv: atmCall.greeks?.iv ?? null,
          }
        : null,
      pe: atmPut
        ? {
            strike: atmPut.strike_price,
            ltp: atmPut.ltp ?? 0,
            oi: atmPut.oi ?? 0,
            oiChange: atmPut.oich ?? 0,
            delta: atmPut.greeks?.delta ?? null,
            gamma: atmPut.greeks?.gamma ?? null,
            theta: atmPut.greeks?.theta ?? null,
            vega: atmPut.greeks?.vega ?? null,
            iv: atmPut.greeks?.iv ?? null,
          }
        : null,
      ivSkew:
        atmCall?.greeks?.iv != null && atmPut?.greeks?.iv != null
          ? atmPut.greeks.iv - atmCall.greeks.iv
          : null,
    };
    const optionLeg = selectReferenceLeg(synthetic, atmStrike, signal, undefined);
    const vetoMode = normalizeVetoMode(
      (
        this.fastify as FastifyInstance & {
          preferences?: { getSettings: () => { vetoMode: string } };
        }
      ).preferences?.getSettings().vetoMode ?? 'strict',
      'strict',
    );
    const alignment = resolvePaAlignment(
      channel.params.paAction,
      signal,
      vetoMode,
    );

    const payload: OptionChainSignalResponse = {
      fetchedAt: new Date().toISOString(),
      cached: false,
      symbol: channel.params.symbol.trim(),
      tradingStyle: channel.params.tradingStyle as TradingStyle,
      score,
      signal,
      bias:
        signal === TradeSignal.BullishTrade
          ? 'bullish'
          : signal === TradeSignal.BearishTrade
            ? 'bearish'
            : 'neutral',
      ivRegime: detectIvRegime(
        atmIv == null ? 0 : atmIv < 12 ? 0.55 : atmIv < 16 ? 0.2 : atmIv < 22 ? 0 : atmIv < 28 ? -0.35 : -0.7,
        parts.vix,
        parts.skew ?? 0,
      ),
      conviction: confidence.percent,
      confidence,
      componentRows: Object.entries(explanations).map(([id, exp]) => ({
        id,
        name: exp.name,
        score: exp.score ?? 0,
        interpretation: exp.interpretation,
        weightage: exp.weightage,
        humanExplanation: exp.meaning,
      })),
      guard: {
        spotLtp: spot,
        atmStrike,
        maxPain,
        pcr: putOiTotal / Math.max(callOiTotal, 1),
        callOiTotal,
        putOiTotal,
        supportStrike: supportResistance?.overallSupport ?? null,
        resistanceStrike: supportResistance?.overallResistance ?? null,
        intradaySupport: supportResistance?.intradaySupport ?? null,
        intradayResistance: supportResistance?.intradayResistance ?? null,
        indiaVix,
        levels: near.map((row) => ({
          strike: row.strike_price,
          type: row.option_type as 'CE' | 'PE',
          oi: row.oi || 0,
          oiChange: row.oich || 0,
          ltp: row.ltp || 0,
          ltpChange: row.ltpch || 0,
          ltpChangePct: row.ltpchp || 0,
          iv: row.greeks?.iv ?? null,
          strength: clampScore(
            ((row.oi || 0) + Math.abs(row.oich || 0)) / Math.max(callOiTotal + putOiTotal, 1),
          ),
        })),
      },
      atmGreeks,
      paAlignment: alignment.alignment,
      paAlignmentDetail: alignment.detail,
      moneyness: undefined,
      optionSide: optionLeg?.option_type as 'CE' | 'PE' | undefined,
      estRiskPerLot: optionLeg
        ? Math.abs((optionLeg.greeks?.delta ?? 0) * (optionLeg.ltp ?? 0))
        : null,
      optionPremium: optionLeg?.ltp ?? null,
      optionStrike: optionLeg?.strike_price ?? null,
      optionDelta: optionLeg?.greeks?.delta ?? null,
      optionGamma: optionLeg?.greeks?.gamma ?? null,
      optionTheta: optionLeg?.greeks?.theta ?? null,
      optionVega: optionLeg?.greeks?.vega ?? null,
      components: parts as unknown as OptionChainSignalResponse['components'],
    };

      channel.lastSnapshot = payload;
      this.broadcast(channel, payload);
    } catch (err) {
      if (isFyersRateLimitError(err)) {
        channel.bootstrapBlockedUntil = Date.now() + 30_000;
      }
      this.log.warn(
        { err, symbol: channel.params.symbol },
        'Option chain refresh failed',
      );
      this.broadcastError(channel, err);
    }
  }

  private broadcastError(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
    err: unknown,
  ): void {
    const message = formatUnknownError(err) || 'Option chain stream failed';
    this.broadcast(channel, {
      type: 'error',
      message,
      retryAfterMs:
        channel.bootstrapBlockedUntil > Date.now()
          ? channel.bootstrapBlockedUntil - Date.now()
          : undefined,
    });
  }

  private broadcast(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
    payload: unknown,
  ): void {
    for (const [id, subscriber] of channel.subscribers) {
      if (subscriber.isClosed()) {
        channel.subscribers.delete(id);
        continue;
      }
      try {
        subscriber.write(payload);
      } catch (err) {
        this.log.warn({ err, subscriberId: id }, 'Option chain stream write failed');
        channel.subscribers.delete(id);
      }
    }
  }
}
