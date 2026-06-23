import './augment-fastify.js';
import { randomUUID } from 'crypto';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { TradingStyle, isIndianMarketOpen } from '@alpha-trader/server-shared';
import type { OptionChainSignalResponse } from '@alpha-trader/server-shared';
import { buildOptionChainSignalResponse } from '@alpha-trader/server-analysis';
import {
  getMarketDataStore,
  getOpenPositionsCacheSnapshot,
  seedIndexQuotesFromRest,
} from '@alpha-trader/server-market-data';
import {
  buildDeckLiveStreamTick,
  buildDeckPositionsLtpPatch,
  buildDeckPositionsUpdate,
  DeckCandlePoint,
  DeckLiveStreamTick,
  invalidateDeckLivePayloadCache,
} from './deck-service.js';
import { patchMultiTfSpotCandles } from './live-candle-patch.js';
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

function resolveDeckSignalRefreshMs(): number {
  const raw = process.env.DECK_SIGNAL_REFRESH_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

function parseTradingStyle(raw?: string): TradingStyle {
  const style = String(raw || TradingStyle.Intraday).toUpperCase();
  if (style === TradingStyle.Scalper) return TradingStyle.Scalper;
  if (style === TradingStyle.Positional) return TradingStyle.Positional;
  return TradingStyle.Intraday;
}

function resolveOptionChainRefreshMs(fastify: FastifyInstance): number {
  const settings = fastify.preferences.getSettings();
  const raw = Number(settings.optionChainPollMs ?? 10_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10_000;
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
      cachedChartCandles: {
        spotCandles?: DeckCandlePoint[];
        spotCandles5m?: DeckCandlePoint[];
        spotCandles15m?: DeckCandlePoint[];
        spotCandles1h?: DeckCandlePoint[];
      } | null;
      lastOptionSnapshot: OptionChainSignalResponse | null;
      lastOptionAction: string | null;
      tickInFlight: boolean;
      ltpInFlight: boolean;
      signalRefreshTimer: NodeJS.Timeout | null;
      optionRefreshTimer: NodeJS.Timeout | null;
      optionInFlight: boolean;
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
        cachedChartCandles: null,
        lastOptionSnapshot: null,
        lastOptionAction: null,
        tickInFlight: false,
        ltpInFlight: false,
        signalRefreshTimer: null,
        optionRefreshTimer: null,
        optionInFlight: false,
      };
      this.channels.set(key, channel);
      this.startHeartbeat(channel);
      this.startSignalRefresh(channel);
      this.startOptionRefresh(channel);
    }

    channel.subscribers.set(subscriber.id, subscriber);
    if (channel.lastTick) subscriber.write(channel.lastTick);
    void seedIndexQuotesFromRest(this.fastify, [normalized.symbol]).then(() => {
      void this.sendLtpPatch(channel);
    });
    void this.sendOptionSnapshot(channel, false);
    void this.sendTick(channel);

    return () => {
      channel?.subscribers.delete(subscriber.id);
      if (channel && channel.subscribers.size === 0) {
        this.stopHeartbeat(channel);
        this.stopSignalRefresh(channel);
        this.stopOptionRefresh(channel);
        this.channels.delete(key);
      }
    };
  }

  shutdown(): void {
    for (const channel of this.channels.values()) {
      this.stopHeartbeat(channel);
      this.stopSignalRefresh(channel);
      this.stopOptionRefresh(channel);
    }
    this.channels.clear();
  }

  getSubscriberCount(params: DeckStreamChannelParams): number {
    const key = deckStreamChannelKey(params);
    return this.channels.get(key)?.subscribers.size ?? 0;
  }

  seedChartCandles(
    params: DeckStreamChannelParams,
    candles: {
      spotCandles?: DeckCandlePoint[];
      spotCandles5m?: DeckCandlePoint[];
      spotCandles15m?: DeckCandlePoint[];
      spotCandles1h?: DeckCandlePoint[];
    },
  ): void {
    const key = deckStreamChannelKey(params);
    const channel = this.channels.get(key);
    if (!channel) return;

    channel.cachedChartCandles = {
      spotCandles: candles.spotCandles?.map((c) => ({ ...c })),
      spotCandles5m: candles.spotCandles5m?.map((c) => ({ ...c })),
      spotCandles15m: candles.spotCandles15m?.map((c) => ({ ...c })),
      spotCandles1h: candles.spotCandles1h?.map((c) => ({ ...c })),
    };
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

  private startSignalRefresh(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.signalRefreshTimer) return;
    const intervalMs = resolveDeckSignalRefreshMs();
    channel.signalRefreshTimer = setInterval(() => {
      if (!isIndianMarketOpen() || channel.subscribers.size === 0) return;
      getMarketDataStore().invalidateLiveHistory(channel.params.symbol.trim());
      invalidateDeckLivePayloadCache(channel.params.symbol.trim());
      void this.sendTick(channel, true);
    }, intervalMs);
    channel.signalRefreshTimer.unref?.();
  }

  private stopSignalRefresh(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.signalRefreshTimer) clearInterval(channel.signalRefreshTimer);
    channel.signalRefreshTimer = null;
  }

  private startOptionRefresh(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.optionRefreshTimer) return;
    const intervalMs = resolveOptionChainRefreshMs(this.fastify);
    if (intervalMs <= 0) return;
    channel.optionRefreshTimer = setInterval(() => {
      if (!isIndianMarketOpen() || channel.subscribers.size === 0) return;
      void this.sendOptionSnapshot(channel, true);
    }, intervalMs);
    channel.optionRefreshTimer.unref?.();
  }

  private stopOptionRefresh(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): void {
    if (channel.optionRefreshTimer) clearInterval(channel.optionRefreshTimer);
    channel.optionRefreshTimer = null;
    channel.optionInFlight = false;
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
    _forceRefresh = false,
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
      const chartPatch = this.patchCachedChartCandles(channel, tick.lastPrice);
      this.broadcast(channel, chartPatch ? { ...tick, ...chartPatch } : tick);
      if (channel.lastOptionAction !== tick.action) {
        void this.sendOptionSnapshot(channel, false);
      }
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

  private async sendOptionSnapshot(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
    forceRefresh: boolean,
  ): Promise<void> {
    if (channel.optionInFlight) return;
    channel.optionInFlight = true;
    try {
      const payload = await buildOptionChainSignalResponse(this.fastify, {
        symbol: channel.params.symbol.trim(),
        tradingStyle: parseTradingStyle(channel.params.tradingStyle),
        paAction: channel.lastTick?.action,
        forceRefresh,
      });
      channel.lastOptionSnapshot = payload;
      channel.lastOptionAction = channel.lastTick?.action ?? null;
      this.broadcast(channel, { type: 'option-chain', ...payload });
    } catch (err) {
      this.log.warn({ err, channel: channel.params }, 'Option chain refresh failed');
      this.broadcast(channel, {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      channel.optionInFlight = false;
    }
  }

  private async sendLtpPatch(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
  ): Promise<void> {
    if (channel.ltpInFlight) return;
    channel.ltpInFlight = true;
    try {
      if (!channel.cachedOpenPositions) {
        const patch = await buildDeckPositionsLtpPatch(
          this.fastify,
          channel.params,
          { entries: [], asOf: new Date().toISOString(), note: null },
          channel.lastTick?.managementContext,
        );
        const chartPatch = this.patchCachedChartCandles(channel, patch.lastPrice);
        this.broadcast(channel, chartPatch ? { ...patch, ...chartPatch } : patch);
        return;
      }

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
      const chartPatch = this.patchCachedChartCandles(channel, patch.lastPrice);
      this.broadcast(channel, chartPatch ? { ...patch, ...chartPatch } : patch);
    } catch (err) {
      this.log.warn({ err, channel: channel.params }, 'Deck LTP patch failed');
    } finally {
      channel.ltpInFlight = false;
    }
  }

  private patchCachedChartCandles(
    channel: NonNullable<ReturnType<typeof this.channels.get>>,
    ltp: number | null | undefined,
  ): Record<string, DeckCandlePoint[]> | null {
    if (!channel.cachedChartCandles || ltp == null || !Number.isFinite(ltp) || ltp <= 0) {
      return null;
    }

    const patched = patchMultiTfSpotCandles(channel.cachedChartCandles, ltp);
    if (!Object.keys(patched).length) return null;

    channel.cachedChartCandles = { ...channel.cachedChartCandles, ...patched };
    return patched;
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