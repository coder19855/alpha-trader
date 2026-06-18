import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { onQuoteTicksUpdated } from '@alpha-trader/server-market-data';
import { fetchOpenIndexOptionPositions } from '@alpha-trader/server-position';
import {
  isIndianMarketOpen,
  TELEGRAM_NOTIFICATION_DEFAULTS,
  TradingStyle,
} from '@alpha-trader/server-shared';
import { DeckStreamHub } from './deck-stream-hub.js';
import { runDeckAutoExitPoll } from './deck-service.js';

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

const deckStreamPlugin = fp(
  async (fastify: FastifyInstance) => {
    const hub = new DeckStreamHub(fastify, fastify.log);
    fastify.decorate('deckStreamHub', hub);

    const unsubscribe = onQuoteTicksUpdated((symbols) => {
      hub.notifyQuoteTicksUpdated(symbols);
    });

    const watchedSymbols = parseWatchSymbols();
    const pollTradingStyle =
      fastify.preferences.getSettings().tradingStyle ?? TradingStyle.Intraday;
    const pollIntervalMs = Number(
      process.env.AUTO_EXIT_POLL_INTERVAL_MS ??
        process.env.TELEGRAM_POLL_INTERVAL_MS ??
        TELEGRAM_NOTIFICATION_DEFAULTS.POLL_INTERVAL_MS,
    );
    let autoExitPollInFlight = false;
    let autoExitPollTimer: NodeJS.Timeout | null = null;

    const runAutoExitPollCycle = async (): Promise<void> => {
      if (autoExitPollInFlight || !isIndianMarketOpen()) return;
      if (!fastify.preferences.getAutoExit().enabled) return;

      autoExitPollInFlight = true;
      try {
        const tokenOk = await fastify.ensureFyersSession();
        if (!tokenOk) return;

        const positions = await fetchOpenIndexOptionPositions(
          fastify,
          watchedSymbols,
        );
        for (const symbol of watchedSymbols) {
          await runDeckAutoExitPoll(fastify, {
            symbol,
            tradingStyle: String(pollTradingStyle),
            preloadedPositions: positions,
          });
        }
      } catch (err) {
        fastify.log.warn({ err }, 'Auto-exit poll failed');
      } finally {
        autoExitPollInFlight = false;
      }
    };

    autoExitPollTimer = setInterval(() => {
      void runAutoExitPollCycle();
    }, pollIntervalMs);
    autoExitPollTimer.unref?.();

    fastify.addHook('onClose', async () => {
      if (autoExitPollTimer) clearInterval(autoExitPollTimer);
      unsubscribe();
      hub.shutdown();
    });
  },
  {
    name: 'deck-stream-hub',
    dependencies: ['fyers-market-stream', 'preferences'],
  },
);

export async function registerDeckStreamPlugin(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(deckStreamPlugin);
}