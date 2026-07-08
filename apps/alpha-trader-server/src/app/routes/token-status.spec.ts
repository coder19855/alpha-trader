import Fastify, { FastifyInstance } from 'fastify';
import tokenStatusRoutes, {
  _resetTokenCacheForTesting,
  _waitForRefreshForTesting,
} from './token-status';

type FyersMock = { isTokenValid: () => Promise<boolean> };

function buildServer(mock: FyersMock): FastifyInstance {
  const s = Fastify();
  s.decorate('fyers', mock);
  s.register(tokenStatusRoutes);
  return s;
}

describe('GET /api/token-status', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server?.close();
    _resetTokenCacheForTesting();
  });

  describe('cache miss (empty cache)', () => {
    it('returns optimistic false immediately and sets pendingRefresh', async () => {
      let resolveToken!: (v: boolean) => void;
      const pending = new Promise<boolean>((res) => {
        resolveToken = res;
      });
      server = buildServer({ isTokenValid: () => pending });
      await server.ready();

      const response = await server.inject({
        method: 'GET',
        url: '/api/token-status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.isTokenValid).toBe(false);
      expect(body.cached).toBe(false);
      expect(body.pendingRefresh).toBe(true);

      // Settle the pending promise to avoid open handle warnings
      resolveToken(true);
    });
  });

  describe('cache hit (fresh cache after background refresh)', () => {
    it('returns cached value with cached:true on subsequent request', async () => {
      server = buildServer({ isTokenValid: async () => true });
      await server.ready();

      // First request – triggers background refresh
      await server.inject({ method: 'GET', url: '/api/token-status' });

      // Wait for the background refresh to settle reliably
      await _waitForRefreshForTesting();

      // Second request – should hit cache
      const response = await server.inject({
        method: 'GET',
        url: '/api/token-status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.isTokenValid).toBe(true);
      expect(body.cached).toBe(true);
    });
  });

  describe('background error handling', () => {
    it('returns 200 with isTokenValid:false when broker throws', async () => {
      server = buildServer({
        isTokenValid: async () => {
          throw new Error('broker unavailable');
        },
      });
      await server.ready();

      const response = await server.inject({
        method: 'GET',
        url: '/api/token-status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.isTokenValid).toBe(false);
    });

    it('does not leak error objects in the response body', async () => {
      server = buildServer({
        isTokenValid: async () => {
          throw new Error('secret internal detail');
        },
      });
      await server.ready();

      const response = await server.inject({
        method: 'GET',
        url: '/api/token-status',
      });

      expect(response.body).not.toContain('secret internal detail');
    });
  });

  describe('background refresh deduplication', () => {
    it('does not launch a second refresh while one is in flight', async () => {
      let callCount = 0;
      let resolveToken!: (v: boolean) => void;
      const pending = new Promise<boolean>((res) => {
        resolveToken = res;
      });

      server = buildServer({
        isTokenValid: () => {
          callCount++;
          return pending;
        },
      });
      await server.ready();

      // Two concurrent requests while refresh is in flight
      await Promise.all([
        server.inject({ method: 'GET', url: '/api/token-status' }),
        server.inject({ method: 'GET', url: '/api/token-status' }),
      ]);

      expect(callCount).toBe(1);
      resolveToken(true);
    });
  });
});
