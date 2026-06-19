import { FastifyInstance } from 'fastify';
import { resolveWebAppOrigin } from '../lib/web-session-cookie';
import { shouldServeWebApp } from '../plugins/static-web';

export default async function webAppRoutes(fastify: FastifyInstance) {
  if (shouldServeWebApp()) {
    return;
  }

  fastify.get('/login', async (_request, reply) => {
    return reply.redirect(`${resolveWebAppOrigin()}/login`);
  });

  fastify.get('/', async (_request, reply) => {
    return reply.redirect(resolveWebAppOrigin());
  });
}