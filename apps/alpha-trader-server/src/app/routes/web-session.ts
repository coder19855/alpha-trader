import { FastifyInstance } from 'fastify';
import { buildWebAppSession } from '@alpha-trader/server-preferences';

export default async function webSessionRoutes(fastify: FastifyInstance) {
  fastify.get('/api/web/session', async (request, reply) => {
    try {
      return await buildWebAppSession(
        fastify,
        request,
        fastify.preferences,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'web session failed');
      return reply.code(502).send({ error: message });
    }
  });
}