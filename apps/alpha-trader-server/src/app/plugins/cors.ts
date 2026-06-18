import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fp from 'fastify-plugin';

export default fp(
  async (fastify: FastifyInstance) => {
    const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
    await fastify.register(cors, {
      origin: origins?.length ? origins : true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    });
  },
  { name: 'cors' },
);