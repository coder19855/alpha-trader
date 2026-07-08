import { FastifyInstance } from 'fastify';
import { withTimeout } from '@alpha-trader/server-shared';

const TOKEN_CACHE_TTL_MS = 20_000;
const TOKEN_VALIDATE_TIMEOUT_MS = 5_000;

interface TokenCache {
  isTokenValid: boolean;
  checkedAt: number;
}

/**
 * Module-level cache is intentional: this server runs as a single Node.js
 * process, so one shared cache per process is exactly what we want.
 * Use `_resetTokenCacheForTesting` to reset between unit tests.
 */
let tokenCache: TokenCache | null = null;
let refreshInFlight = false;
let refreshPromise: Promise<void> | null = null;

/** Exposed only for unit tests — do not call in production code. */
export function _resetTokenCacheForTesting(): void {
  tokenCache = null;
  refreshInFlight = false;
  refreshPromise = null;
}

/** Exposed only for unit tests — awaits any in-flight background refresh. */
export function _waitForRefreshForTesting(): Promise<void> {
  return refreshPromise ?? Promise.resolve();
}

function triggerBackgroundRefresh(fastify: FastifyInstance): void {
  if (refreshInFlight) return;
  refreshInFlight = true;

  refreshPromise = (async () => {
    try {
      const isTokenValid = await withTimeout(
        fastify.fyers.isTokenValid(),
        TOKEN_VALIDATE_TIMEOUT_MS,
        'token-status validation',
      );
      tokenCache = { isTokenValid, checkedAt: Date.now() };
    } catch (err) {
      fastify.log.warn({ err }, 'token-status background refresh failed');
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
    // Deliberately return the last-known (possibly stale) value while the
    // background refresh runs. This keeps the response fast even when the
    // broker is slow or briefly unavailable. The freshest value will be
    // in the cache on the next request once the refresh settles.
    triggerBackgroundRefresh(fastify);

    return reply.send({ isTokenValid: optimistic, cached: false, pendingRefresh: true });
  });
}