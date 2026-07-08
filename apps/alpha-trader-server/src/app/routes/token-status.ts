import { FastifyInstance } from 'fastify';
import { withTimeout } from '@alpha-trader/server-shared';

const TOKEN_CACHE_TTL_MS = 20_000;
const TOKEN_VALIDATE_TIMEOUT_MS = 5_000;

interface TokenCache {
  isTokenValid: boolean;
  checkedAt: number;
}

let tokenCache: TokenCache | null = null;
let refreshInFlight = false;

/** Exposed only for unit tests — do not call in production code. */
export function _resetTokenCacheForTesting(): void {
  tokenCache = null;
  refreshInFlight = false;
}

function triggerBackgroundRefresh(fastify: FastifyInstance): void {
  if (refreshInFlight) return;
  refreshInFlight = true;

  void (async () => {
    try {
      const isTokenValid = await withTimeout(
        fastify.fyers.isTokenValid(),
        TOKEN_VALIDATE_TIMEOUT_MS,
        'token-status validation',
      );
      tokenCache = { isTokenValid, checkedAt: Date.now() };
    } catch {
      if (!tokenCache) {
        tokenCache = { isTokenValid: false, checkedAt: Date.now() };
      }
    } finally {
      refreshInFlight = false;
    }
  })();
}

export default async function tokenStatusRoutes(fastify: FastifyInstance) {
  fastify.get('/api/token-status', async (_request, reply) => {
    const now = Date.now();

    if (tokenCache && now - tokenCache.checkedAt < TOKEN_CACHE_TTL_MS) {
      return reply.send({ isTokenValid: tokenCache.isTokenValid, cached: true });
    }

    const optimistic = tokenCache?.isTokenValid ?? false;
    triggerBackgroundRefresh(fastify);

    return reply.send({ isTokenValid: optimistic, cached: false, pendingRefresh: true });
  });
}