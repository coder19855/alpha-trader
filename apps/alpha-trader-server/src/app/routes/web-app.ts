import { FastifyInstance } from 'fastify';
import { resolveWebAppOrigin } from '../lib/web-session-cookie';

export default async function webAppRoutes(fastify: FastifyInstance) {
  fastify.get('/login', async (_request, reply) => {
    return reply.redirect(`${resolveWebAppOrigin()}/login`);
  });

  fastify.get('/', async (_request, reply) => {
    return reply.redirect(resolveWebAppOrigin());
  });
}