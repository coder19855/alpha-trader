import { FastifyInstance } from 'fastify';

export default async function (fastify: FastifyInstance) {
  fastify.get('/api', async function () {
    return {
      message: 'Alpha Trader API',
      version: '0.1.0',
      phase: 1,
    };
  });
}
