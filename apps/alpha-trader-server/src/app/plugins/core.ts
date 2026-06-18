import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  registerFyersPlugin,
  registerMongoPlugin,
} from '@alpha-trader/server-auth';
import { registerAnalysisPlugins } from '@alpha-trader/server-analysis';
import { registerMarketDataPlugins } from '@alpha-trader/server-market-data';
import { registerOpenPositionsStreamPlugin } from '@alpha-trader/server-stream';
import { registerPreferencesPlugin } from '@alpha-trader/server-preferences';
import { registerDeckStreamPlugin } from '@alpha-trader/server-deck';
import {
  FYERS_OPTION_INDEX_SYMBOLS,
} from '@alpha-trader/server-shared';
import { fetchOpenIndexOptionPositions } from '@alpha-trader/server-position';
import {
  getAllHeldOptionSymbols,
  notifyOpenOutcomeSymbols,
} from '@alpha-trader/server-market-data';

export default fp(
  async (fastify: FastifyInstance) => {
    await registerMongoPlugin(fastify);
    await registerFyersPlugin(fastify);
    await registerAnalysisPlugins(fastify);
    await registerMarketDataPlugins(fastify);
    await registerPreferencesPlugin(fastify);
    await registerDeckStreamPlugin(fastify);
    await registerOpenPositionsStreamPlugin(fastify);

    fastify.addHook('onReady', async () => {
      const allIndexSymbols = FYERS_OPTION_INDEX_SYMBOLS.map((row) => row.symbol);
      try {
        await fetchOpenIndexOptionPositions(fastify, allIndexSymbols, {
          forceFresh: true,
        });
        notifyOpenOutcomeSymbols(getAllHeldOptionSymbols());
        fastify.deckStreamHub.notifyOpenPositionsChanged(allIndexSymbols);
      } catch (err) {
        fastify.log.warn({ err }, 'Initial open positions bootstrap failed');
      }
    });
  },
  { name: 'alpha-trader-core' },
);