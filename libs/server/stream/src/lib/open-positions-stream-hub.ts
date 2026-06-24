import './augment-fastify.js';
import { randomUUID } from 'crypto';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import {
  TradingStyle,
  TradeDecisionAlertPayload,
  isIndianMarketOpen,
} from '@alpha-trader/server-shared';
import { computePriceAction, computePaDecision } from '@alpha-trader/server-analysis';
import {
  buildOpenPositionContextFromPositions,
  computeManagementAdvice,
  fetchOpenIndexOptionPositions,
  ManagementAdvice,
  PositionManagementContext,
} from '@alpha-trader/server-position';
import { getOpenPositionsCacheSnapshot } from '@alpha-trader/server-market-data';

export interface OpenPositionsStreamParams {
  symbol: string;
  tradingStyle?: string;
}

export interface OpenPositionsStreamSubscriber {
  id: string;
  write: (payload: unknown) => void;
  writeHeartbeat: () => void;
  isClosed: () => boolean;
}

export interface OpenPositionsStreamTick {
  type: 'tick';
  asOf: string;
  symbol: string;
  tradingStyle: string;
  marketOpen: boolean;
  lastPrice: number | null;
  action: string;
  bias: string;
  conviction: number;
  managementContext: PositionManagementContext;
}

export interface OpenPositionsLtpPatch {
  type: 'ltp';
  asOf: string;
  symbol: string;
  lastPrice: number | null;
  positions: Array<{
    symbol: string;
    ltp: number | null;
    unrealizedPnl: number;
  }>;
}

function parseTradingStyle(raw?: string): TradingStyle {
  const style = String(raw || TradingStyle.Intraday).toUpperCase();
  if (style === TradingStyle.Scalper) return TradingStyle.Scalper;
  if (style === TradingStyle.Positional) return TradingStyle.Positional;
  return TradingStyle.Intraday;
}

export function openPositionsStreamChannelKey(
  params: OpenPositionsStreamParams,
): string {
  const symbol = params.symbol.trim();
  const style = parseTradingStyle(params.tradingStyle);
  return `${symbol}:${style}`;
}

export class OpenPositionsStreamHub {
  private readonly channels = new Map<
    string,
    {
      params: OpenPositionsStreamParams;
      subscribers: Map<string, OpenPositionsStreamSubscriber>;
      heartbeatTimer: NodeJS.Timeout | null;
      lastTick: OpenPositionsStreamTick | null;
    }
  >();

  constructor(
    private readonly fastify: FastifyInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  subscribe(
    params: OpenPositionsStreamParams,
    subscriber: OpenPositionsStreamSubscriber,
  ): () => void {
    const normalized = {
      symbol: params.symbol.trim(),
      tradingStyle: parseTradingStyle(params.tradingStyle),
    };
    const key = openPositionsStreamChannelKey(normalized);
    let channel = this.channels.get(key);
    if (!channel) {
      channel = {
        params: normalized,
        subscribers: new Map(),
        heartbeatTimer: null,
        lastTick: null,
      };
      this.channels.set(key, channel);
      this.startChannelTimers(channel);
    }

    channel.subscribers.set(subscriber.id, subscriber);
    if (channel.lastTick) subscriber.write(channel.lastTick);
    void this.sendTick(channel);

    return () => {
      channel?.subscribers.delete(subscriber.id);
      if (channel && channel.subscribers.size === 0) {
        this.stopChannelTimers(channel);
        this.channels.delete(key);
      }
    };
  }

  shutdown(): void {
    for (const channel of this.channels.values()) {
      this.stopChannelTimers(channel);
    }
    this.channels.clear();
  }

  notifyQuoteTicksUpdated(symbols: string[]): void {
    if (!isIndianMarketOpen()) return;
    const unique = [...new Set(symbols.filter(Boolean))];

    for (const channel of this.channels.values()) {
      if (channel.subscribers.size === 0) continue;
      const indexSymbol = channel.params.symbol.trim();
      const snapshot = getOpenPositionsCacheSnapshot();
      const relevant = unique.some(
        (symbol) =>
          symbol === indexSymbol ||
          snapshot?.positions.some((entry) => entry.symbol === symbol),
      );
      if (!relevant) continue;

      void this.sendLtpPatch(channel);
    }
  }

  private startChannelTimers(
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

  private stopChannelTimers(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.heartbeatTimer) clearInterval(channel.heartbeatTimer);
    channel.heartbeatTimer = null;
  }

  private async sendTick(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    try {
      const tick = await this.buildTick(channel.params);
      channel.lastTick = tick;
      this.broadcast(channel, tick);
    } catch (err) {
      this.log.warn({ err, channel: channel.params }, 'Open positions stream tick failed');
      this.broadcast(channel, {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async sendLtpPatch(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    const indexSymbol = channel.params.symbol.trim();
    const livePrice =
      this.fastify.fyersMarketStream?.getIndexLtp(indexSymbol) ?? null;
    const snapshot = getOpenPositionsCacheSnapshot();
    const positions = (snapshot?.positions ?? [])
      .filter((p) => p.indexSymbol === indexSymbol)
      .map((p) => ({
        symbol: p.symbol,
        ltp: this.fastify.fyersMarketStream?.getOptionLtp(p.symbol) ?? null,
        unrealizedPnl: p.unrealizedPnl,
      }));

    this.broadcast(channel, {
      type: 'ltp',
      asOf: new Date().toISOString(),
      symbol: indexSymbol,
      lastPrice: livePrice,
      positions,
    } satisfies OpenPositionsLtpPatch);
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
        this.log.warn({ err, subscriberId: id }, 'Stream subscriber write failed');
        channel.subscribers.delete(id);
      }
    }
  }

  private async buildTick(
    params: OpenPositionsStreamParams,
  ): Promise<OpenPositionsStreamTick> {
    const symbol = params.symbol.trim();
    const tradingStyle = parseTradingStyle(params.tradingStyle);

    const priceData = await computePriceAction(this.fastify, {
      symbol,
      tradingStyle,
    });
    if (!priceData) {
      throw new Error('Price action unavailable');
    }

    const paDecision = computePaDecision(this.fastify, priceData, tradingStyle);
    const decisionPayload: TradeDecisionAlertPayload = {
      symbol,
      tradingStyle,
      lastPrice: priceData.lastPrice,
      action: paDecision.action,
      bias: paDecision.bias,
      conviction: paDecision.conviction,
      recommendation: paDecision.recommendation,
      humanSummary: paDecision.humanSummary,
      tradeGuidance: {
        shouldConsiderTrade: paDecision.conviction >= 35,
      },
      priceAction: {
        action: priceData.signal.action as TradeDecisionAlertPayload['priceAction']['action'],
        confidence: priceData.signal.confidence,
        structuralAction: priceData.signal.structuralAction as TradeDecisionAlertPayload['priceAction']['action'],
        vetoReason: priceData.signal.vetoReason,
        confidenceBeforeDecay: paDecision.priceConvictionBeforeDecay,
      },
      recommendedStrategies: [],
      tradeSetup: priceData.tradeSetup ?? null,
      momentumDecayPercent: priceData.momentumDecay?.decayPercent ?? null,
    };

    const positions = await fetchOpenIndexOptionPositions(this.fastify, [symbol]);
    const positionContext = buildOpenPositionContextFromPositions(positions);
    const liveLastPrice =
      this.fastify.fyersMarketStream?.getIndexLtp(symbol) ?? priceData.lastPrice;

    let managementContext: PositionManagementContext = {
      hasOpenPosition: positionContext.count > 0,
      heldDirection: positionContext.heldDirection,
      isMixedDirections: positionContext.isMixedDirections,
      count: positionContext.count,
    };

    if (positionContext.count > 0 && positionContext.heldDirection) {
      const advice: ManagementAdvice = computeManagementAdvice(
        positionContext,
        decisionPayload,
        { ...priceData, lastPrice: liveLastPrice },
        tradingStyle,
      );
      managementContext = {
        ...managementContext,
        advice,
        note: advice.headline,
        health: advice.positionHealth,
      };
    }

    return {
      type: 'tick',
      asOf: new Date().toISOString(),
      symbol,
      tradingStyle,
      marketOpen: isIndianMarketOpen(),
      lastPrice: liveLastPrice,
      action: paDecision.action,
      bias: paDecision.bias,
      conviction: paDecision.conviction,
      managementContext,
    };
  }
}

export function createOpenPositionsStreamSubscriber(
  reply: { raw: { write: (chunk: string) => void } },
  isClosed: () => boolean,
): OpenPositionsStreamSubscriber {
  return {
    id: randomUUID(),
    isClosed,
    write(payload: unknown) {
      if (isClosed()) return;
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    },
    writeHeartbeat() {
      if (isClosed()) return;
      reply.raw.write(': heartbeat\n\n');
    },
  };
}