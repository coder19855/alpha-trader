import './augment-fastify.js';
import { randomUUID } from 'crypto';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { TradingStyle, isIndianMarketOpen } from '@alpha-trader/server-shared';
import { getOpenPositionsCacheSnapshot } from '@alpha-trader/server-market-data';
import {
  buildDeckLiveStreamTick,
  buildDeckPositionsLtpPatch,
  buildDeckPositionsUpdate,
  DeckLiveStreamTick,
} from './deck-service.js';
import type { DeckOpenPositionsPayload } from './deck-open-positions.js';

export interface DeckStreamChannelParams {
  symbol: string;
  tradingStyle?: string;
}

export interface DeckStreamSubscriber {
  id: string;
  write: (payload: unknown) => void;
  writeHeartbeat: () => void;
  isClosed: () => boolean;
}

export function deckStreamChannelKey(params: DeckStreamChannelParams): string {
  const symbol = params.symbol.trim();
  const style = String(params.tradingStyle || TradingStyle.Intraday).toUpperCase();
  return `${symbol}:${style}`;
}

function parseTradingStyle(raw?: string): TradingStyle {
  const style = String(raw || TradingStyle.Intraday).toUpperCase();
  if (style === TradingStyle.Scalper) return TradingStyle.Scalper;
  if (style === TradingStyle.Positional) return TradingStyle.Positional;
  return TradingStyle.Intraday;
}

export class DeckStreamHub {
  private readonly channels = new Map<
    string,
    {
      params: DeckStreamChannelParams;
      subscribers: Map<string, DeckStreamSubscriber>;
      heartbeatTimer: NodeJS.Timeout | null;
      lastTick: DeckLiveStreamTick | null;
      cachedOpenPositions: DeckOpenPositionsPayload | null;
      tickInFlight: boolean;
      ltpInFlight: boolean;
    }
  >();

  constructor(
    private readonly fastify: FastifyInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  subscribe(
    params: DeckStreamChannelParams,
    subscriber: DeckStreamSubscriber,
  ): () => void {
    const normalized = {
      symbol: params.symbol.trim(),
      tradingStyle: parseTradingStyle(params.tradingStyle),
    };
    const key = deckStreamChannelKey(normalized);
    let channel = this.channels.get(key);
    if (!channel) {
      channel = {
        params: normalized,
        subscribers: new Map(),
        heartbeatTimer: null,
        lastTick: null,
        cachedOpenPositions: null,
        tickInFlight: false,
        ltpInFlight: false,
      };
      this.channels.set(key, channel);
      this.startHeartbeat(channel);
    }

    channel.subscribers.set(subscriber.id, subscriber);
    if (channel.lastTick) subscriber.write(channel.lastTick);
    void this.sendTick(channel);

    return () => {
      channel?.subscribers.delete(subscriber.id);
      if (channel && channel.subscribers.size === 0) {
        this.stopHeartbeat(channel);
        this.channels.delete(key);
      }
    };
  }

  shutdown(): void {
    for (const channel of this.channels.values()) {
      this.stopHeartbeat(channel);
    }
    this.channels.clear();
  }

  getSubscriberCount(params: DeckStreamChannelParams): number {
    const key = deckStreamChannelKey(params);
    return this.channels.get(key)?.subscribers.size ?? 0;
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
      void this.sendTick(channel);
    }
  }

  notifyOpenPositionsChanged(indexSymbols: string[]): void {
    const unique = [...new Set(indexSymbols.filter(Boolean))];
    if (!unique.length) return;

    for (const channel of this.channels.values()) {
      if (channel.subscribers.size === 0) continue;
      if (!unique.includes(channel.params.symbol.trim())) continue;
      void this.sendPositionsUpdate(channel);
      void this.sendTick(channel);
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
        this.log.warn({ err, subscriberId: id }, 'Deck stream write failed');
        channel.subscribers.delete(id);
      }
    }
  }

  private async sendTick(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    if (channel.tickInFlight) return;
    channel.tickInFlight = true;
    try {
      const tick = await buildDeckLiveStreamTick(
        this.fastify,
        channel.params,
        channel.cachedOpenPositions ?? undefined,
      );
      channel.lastTick = tick;
      channel.cachedOpenPositions = tick.openPositions ?? channel.cachedOpenPositions;
      this.broadcast(channel, tick);
    } catch (err) {
      this.log.warn({ err, channel: channel.params }, 'Deck stream tick failed');
      this.broadcast(channel, {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      channel.tickInFlight = false;
    }
  }

  private async sendLtpPatch(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    if (channel.ltpInFlight || !channel.cachedOpenPositions) return;
    channel.ltpInFlight = true;
    try {
      const patch = await buildDeckPositionsLtpPatch(
        this.fastify,
        channel.params,
        channel.cachedOpenPositions,
        channel.lastTick?.managementContext,
      );
      channel.cachedOpenPositions = patch.openPositions;
      if (patch.managementContext && channel.lastTick) {
        channel.lastTick = {
          ...channel.lastTick,
          managementContext: patch.managementContext,
        };
      }
      this.broadcast(channel, patch);
    } catch (err) {
      this.log.warn({ err, channel: channel.params }, 'Deck LTP patch failed');
    } finally {
      channel.ltpInFlight = false;
    }
  }

  private async sendPositionsUpdate(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    try {
      const update = await buildDeckPositionsUpdate(
        this.fastify,
        channel.params,
      );
      channel.cachedOpenPositions = update.openPositions;
      this.broadcast(channel, update);
    } catch (err) {
      this.log.warn({ err, channel: channel.params }, 'Deck positions update failed');
    }
  }
}

export function createDeckStreamSubscriber(
  reply: { raw: { write: (chunk: string) => void } },
  isClosed: () => boolean,
): DeckStreamSubscriber {
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