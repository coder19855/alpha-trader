import Fastify, { FastifyInstance } from 'fastify';
import { app } from './app';

describe('GET /api', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = Fastify();
    await server.register(app);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns API health payload', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: 'Alpha Trader API',
      phase: 1,
    });
  });
});