import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { onQuoteTicksUpdated } from '@alpha-trader/server-market-data';
import {
  OpenPositionsStreamHub,
} from './open-positions-stream-hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    openPositionsStreamHub: OpenPositionsStreamHub;
  }
}

const openPositionsStreamPlugin = fp(
  async (fastify: FastifyInstance) => {
    const hub = new OpenPositionsStreamHub(fastify, fastify.log);
    fastify.decorate('openPositionsStreamHub', hub);

    const unsubscribe = onQuoteTicksUpdated((symbols) => {
      hub.notifyQuoteTicksUpdated(symbols);
    });

    fastify.addHook('onClose', async () => {
      unsubscribe();
      hub.shutdown();
    });
  },
  { name: 'open-positions-stream-hub', dependencies: ['fyers-market-stream'] },
);

export async function registerOpenPositionsStreamPlugin(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(openPositionsStreamPlugin);
}