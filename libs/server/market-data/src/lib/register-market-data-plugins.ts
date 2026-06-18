import './augment-fastify.js';
import { fyersModel, FyersAPI } from 'fyers-api-v3';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  resolveFyersWsEnabled,
  resolveFyersWsSessionCheckMs,
  resolveFyersOrderWsEnabled,
  resolveFyersOrderWsSessionCheckMs,
  TELEGRAM_NOTIFICATION_DEFAULTS,
  isIndianMarketOpen,
} from '@alpha-trader/server-shared';
import { FyersMarketStreamManager } from './fyers-market-stream-manager.js';
import { FyersOrderStreamManager } from './fyers-order-stream-manager.js';
import {
  bindMarketStreamHooks,
  notifyWatchIndexSymbols,
  notifyOpenOutcomeSymbols,
} from './market-stream-coordinator.js';
import { getQuoteCache } from './quote-cache.js';
import { getMarketDataStore } from './market-data-store.js';
import {
  getAllHeldOptionSymbols,
  getOpenPositionsWsStats,
} from './open-positions-live-cache.js';
function parseWatchSymbols(): string[] {
  const raw =
    process.env.ALPHA_WATCH_SYMBOLS ?? process.env.TELEGRAM_NOTIFY_SYMBOLS;
  if (raw?.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...TELEGRAM_NOTIFICATION_DEFAULTS.DEFAULT_SYMBOLS];
}

function asMutableFyers(fyers: fyersModel): Record<string, unknown> {
  return fyers as unknown as Record<string, unknown>;
}

const marketDataCachePlugin = fp(
  async (fastify: FastifyInstance) => {
    const store = getMarketDataStore();
    const target = asMutableFyers(fastify.fyers);

    const originalGetHistory = target.getHistory;
    if (typeof originalGetHistory === 'function') {
      target.getHistory = function wrappedGetHistory(
        this: fyersModel,
        ...args: unknown[]
      ) {
        const params = args[0] as FyersAPI.HistoryQueryRequest;
        return store.getHistory(params, () =>
          (
            originalGetHistory as (
              ...a: [FyersAPI.HistoryQueryRequest]
            ) => Promise<FyersAPI.HistoryResponse>
          ).apply(this, [params]),
        );
      };
    }

    fastify.decorate('marketDataCache', {
      getStats: () => store.getStats(),
    });
  },
  { name: 'market-data-cache', dependencies: ['fyers'] },
);

const fyersMarketStreamPlugin = fp(
  async (fastify: FastifyInstance) => {
    const enabled = resolveFyersWsEnabled();
    const manager = new FyersMarketStreamManager(fastify.log);
    let sessionTimer: NodeJS.Timeout | null = null;

    bindMarketStreamHooks({
      syncOpenOutcomeSymbols: (symbols) => {
        manager.syncOpenOutcomeSymbols(symbols);
      },
      addWatchIndexSymbols: (symbols) => {
        manager.addWatchIndexSymbols(symbols);
      },
    });

    notifyWatchIndexSymbols(parseWatchSymbols());

    async function syncSession(): Promise<void> {
      if (!enabled) return;

      const marketOpen = isIndianMarketOpen(
        Date.now(),
        TELEGRAM_NOTIFICATION_DEFAULTS.IST_TIMEZONE,
        TELEGRAM_NOTIFICATION_DEFAULTS.SESSION_OPEN,
        TELEGRAM_NOTIFICATION_DEFAULTS.SESSION_CLOSE,
      );

      if (!marketOpen) {
        if (manager.isConnected()) await manager.disconnect();
        return;
      }

      const tokenOk = await fastify.ensureFyersSession();
      if (!tokenOk) {
        await manager.disconnect();
        return;
      }

      const appId = process.env.FYERS_API_KEY || '';
      const accessToken = await fastify.fyers.getAccessToken();
      if (!appId || !accessToken) return;

      await manager.connect(accessToken, appId);
    }

    fastify.decorate('fyersMarketStream', {
      isEnabled: () => enabled,
      isConnected: () => manager.isConnected(),
      getIndexLtp: (symbol: string) => manager.getIndexLtp(symbol),
      getOptionLtp: (symbol: string) => manager.getOptionLtp(symbol),
      getSpotSeries: (symbol: string, maxAgeMs?: number) =>
        manager.getSpotSeries(symbol, maxAgeMs),
      getQuote: (symbol: string) => getQuoteCache().get(symbol),
      getStats: () => manager.getStats(enabled),
      syncSession: () => syncSession(),
    });

    if (enabled) {
      void syncSession().catch((err) => {
        fastify.log.warn({ err }, 'Initial Fyers WS session sync failed');
      });

      sessionTimer = setInterval(() => {
        void syncSession().catch((err) => {
          fastify.log.warn({ err }, 'Fyers WS session sync failed');
        });
      }, resolveFyersWsSessionCheckMs());
      sessionTimer.unref();
    }

    fastify.addHook('onClose', async () => {
      if (sessionTimer) clearInterval(sessionTimer);
      bindMarketStreamHooks(null);
      await manager.disconnect();
    });
  },
  { name: 'fyers-market-stream', dependencies: ['fyers', 'market-data-cache'] },
);

const fyersOrderStreamPlugin = fp(
  async (fastify: FastifyInstance) => {
    const enabled = resolveFyersOrderWsEnabled();
    let sessionTimer: NodeJS.Timeout | null = null;

    const manager = new FyersOrderStreamManager(
      fastify.log,
      () => {
        notifyOpenOutcomeSymbols(getAllHeldOptionSymbols());
      },
      async () => {
        notifyOpenOutcomeSymbols(getAllHeldOptionSymbols());
        fastify.log.info('Fyers order WS connected — position bootstrap pending');
      },
    );

    async function syncSession(): Promise<void> {
      if (!enabled) return;

      const marketOpen = isIndianMarketOpen(
        Date.now(),
        TELEGRAM_NOTIFICATION_DEFAULTS.IST_TIMEZONE,
        TELEGRAM_NOTIFICATION_DEFAULTS.SESSION_OPEN,
        TELEGRAM_NOTIFICATION_DEFAULTS.SESSION_CLOSE,
      );

      if (!marketOpen) {
        if (manager.isConnected()) await manager.disconnect();
        return;
      }

      const tokenOk = await fastify.ensureFyersSession();
      if (!tokenOk) {
        await manager.disconnect();
        return;
      }

      const appId = process.env.FYERS_API_KEY || '';
      const accessToken = await fastify.fyers.getAccessToken();
      if (!appId || !accessToken) return;

      await manager.connect(accessToken, appId);
    }

    fastify.decorate('fyersOrderStream', {
      isEnabled: () => enabled,
      isConnected: () => manager.isConnected(),
      getStats: () => ({
        ...manager.getStats(enabled),
        ...getOpenPositionsWsStats(),
      }),
      syncSession: () => syncSession(),
    });

    if (enabled) {
      void syncSession().catch((err) => {
        fastify.log.warn({ err }, 'Initial Fyers order WS session sync failed');
      });

      sessionTimer = setInterval(() => {
        void syncSession().catch((err) => {
          fastify.log.warn({ err }, 'Fyers order WS session sync failed');
        });
      }, resolveFyersOrderWsSessionCheckMs());
      sessionTimer.unref();
    }

    fastify.addHook('onClose', async () => {
      if (sessionTimer) clearInterval(sessionTimer);
      await manager.disconnect();
    });
  },
  { name: 'fyers-order-stream', dependencies: ['fyers'] },
);

export async function registerMarketDataPlugins(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(marketDataCachePlugin);
  await fastify.register(fyersMarketStreamPlugin);
  await fastify.register(fyersOrderStreamPlugin);
}