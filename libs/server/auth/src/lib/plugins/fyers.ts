import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { fyersModel } from 'fyers-api-v3';
import { withTimeout, ResponseStatus } from '@alpha-trader/server-shared';

const FYERS_TOKEN_MISS_TTL_MS = 2_000;
const FYERS_SESSION_ENSURE_TTL_MS = 10_000;
const FYERS_SESSION_VERIFY_TTL_MS = 15_000;
const FYERS_SLOW_PATH_LOG_MS = 1_000;

type CachedTokenState = {
  token: string;
  expiresAt: number | null;
  loadedAt: number;
};

type EnsureCacheKey = 'basic' | 'verified';

type EnsureCacheEntry = {
  checkedAt: number;
  ready: boolean;
  token: string;
  expiresAt: number | null;
};

function parseTokenExpiry(token: string): number | null {
  if (!token) return null;

  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const decodedPayload = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    const payload = JSON.parse(decodedPayload) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function resolvePrewarmEnabled(): boolean {
  if (process.env.FYERS_SESSION_PREWARM === 'true') return true;
  if (process.env.FYERS_SESSION_PREWARM === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

const fyersPlugin = fp(
  async (fastify: FastifyInstance) => {
    const fyers = new fyersModel();
    let tokenCache: CachedTokenState | null = null;
    let tokenFetchInFlight: Promise<string> | null = null;
    const ensureCache = new Map<EnsureCacheKey, EnsureCacheEntry>();
    const ensureInFlight = new Map<EnsureCacheKey, Promise<boolean>>();

    const originalSetAccessToken = fyers.setAccessToken.bind(fyers);

    function logDuration(
      message: string,
      startedAt: number,
      meta: Record<string, unknown>,
    ): void {
      const durationMs = Date.now() - startedAt;
      const log = durationMs >= FYERS_SLOW_PATH_LOG_MS
        ? fastify.log.info.bind(fastify.log)
        : fastify.log.debug.bind(fastify.log);
      log({ durationMs, ...meta }, message);
    }

    function invalidateEnsureCache(): void {
      ensureCache.clear();
      ensureInFlight.clear();
    }

    function updateTokenCache(token: string): void {
      const normalized = token.trim();
      const expiresAt = parseTokenExpiry(normalized);
      const previous = tokenCache;

      tokenCache = {
        token: normalized,
        expiresAt,
        loadedAt: Date.now(),
      };

      if (
        !previous ||
        previous.token !== normalized ||
        previous.expiresAt !== expiresAt
      ) {
        invalidateEnsureCache();
      }
    }

    function getCachedToken(now = Date.now()): string | undefined {
      if (!tokenCache) return undefined;
      if (!tokenCache.token) {
        return now - tokenCache.loadedAt <= FYERS_TOKEN_MISS_TTL_MS ? '' : undefined;
      }
      if (!tokenCache.expiresAt || now >= tokenCache.expiresAt) return undefined;
      return tokenCache.token;
    }

    function getEnsureCache(
      key: EnsureCacheKey,
      now = Date.now(),
    ): boolean | undefined {
      const cached = ensureCache.get(key);
      if (!cached) return undefined;

      const ttlMs = cached.ready
        ? key === 'verified'
          ? FYERS_SESSION_VERIFY_TTL_MS
          : FYERS_SESSION_ENSURE_TTL_MS
        : FYERS_TOKEN_MISS_TTL_MS;

      if (now - cached.checkedAt > ttlMs) return undefined;
      if (cached.token !== (tokenCache?.token ?? '')) return undefined;
      if (!cached.token || !cached.expiresAt || now >= cached.expiresAt) return false;
      return cached.ready;
    }

    async function loadAccessToken(forceRefresh = false): Promise<string> {
      const now = Date.now();
      const cached = !forceRefresh ? getCachedToken(now) : undefined;
      if (cached !== undefined) return cached;
      if (!forceRefresh && tokenFetchInFlight) return tokenFetchInFlight;

      const startedAt = Date.now();
      const fetchPromise = (async () => {
        if (!fastify.mongo || !fastify.mongo.db) {
          updateTokenCache('');
          return '';
        }

        const col = fastify.mongo.db.collection<{
          _id?: string;
          token: string;
          timestamp: number;
        }>('access-tokens');
        const data =
          (await col.findOne({ _id: 'latest' })) ??
          (await col.findOne({}, { sort: { timestamp: -1 } }));
        const token = data?.token?.trim() || '';
        updateTokenCache(token);
        return token;
      })()
        .finally(() => {
          tokenFetchInFlight = null;
        });

      tokenFetchInFlight = fetchPromise;
      const token = await fetchPromise;
      logDuration('Fyers token fetch complete', startedAt, {
        cacheHit: false,
        tokenPresent: Boolean(token),
      });
      return token;
    }

    fyers.initialize = async function () {
      const appId = process.env.FYERS_API_KEY || '';
      const redirectUrl = process.env.FYERS_REDIRECT_URL || '';

      if (appId) fyers.setAppId(appId);
      if (redirectUrl) fyers.setRedirectUrl(redirectUrl);
      const token = await loadAccessToken();
      const expiresAt = parseTokenExpiry(token);
      if (token && expiresAt && Date.now() < expiresAt) {
        fyers.setAccessToken(token);
      } else {
        fyers.setAccessToken('');
      }
    };

    fyers.getAccessToken = async function () {
      return loadAccessToken();
    };

    fyers.isTokenValid = async function () {
      const token = await loadAccessToken();

      if (!token) {
        return false;
      }

      const expiresAt = parseTokenExpiry(token);
      return Boolean(expiresAt && Date.now() < expiresAt);
    };

    fyers.setAccessToken = function (token: string) {
      updateTokenCache(token);
      originalSetAccessToken(token);
    };

    async function ensureFyersSession(options?: {
      verifyWithApi?: boolean;
    }): Promise<boolean> {
      const verifyWithApi = Boolean(options?.verifyWithApi);
      const cacheKey: EnsureCacheKey = verifyWithApi ? 'verified' : 'basic';
      const cached = getEnsureCache(cacheKey);
      if (cached !== undefined) return cached;

      const existingInFlight = ensureInFlight.get(cacheKey);
      if (existingInFlight) return existingInFlight;

      const startedAt = Date.now();
      const ensurePromise = (async () => {
        await fyers.initialize();
        const token = await loadAccessToken();
        const expiresAt = parseTokenExpiry(token);
        let ready = Boolean(token && expiresAt && Date.now() < expiresAt);

        if (ready && verifyWithApi) {
          try {
            const response = await withTimeout(
              fyers.get_profile(),
              15_000,
              'Fyers get_profile',
            );
            ready = (response as { s?: string }).s === ResponseStatus.ok;
          } catch (error) {
            fastify.log.warn({ err: error }, 'Fyers API session verification failed');
            ready = false;
          }
        }

        ensureCache.set(cacheKey, {
          checkedAt: Date.now(),
          ready,
          token,
          expiresAt,
        });
        logDuration('Fyers session ensure complete', startedAt, {
          verifyWithApi,
          ready,
          tokenPresent: Boolean(token),
        });
        return ready;
      })()
        .finally(() => {
          ensureInFlight.delete(cacheKey);
        });

      ensureInFlight.set(cacheKey, ensurePromise);
      return ensurePromise;
    }

    fastify.addHook('onReady', async () => {
      if (!resolvePrewarmEnabled()) return;
      const ready = await ensureFyersSession();
      if (ready) {
        fastify.log.info('Fyers session cache prewarmed');
      }
    });

    // SDK method is snake_case `place_order`; keep camelCase alias for callers.
    const placeOrderFn = (fyers as { place_order?: (req: unknown) => Promise<unknown> })
      .place_order;
    if (typeof placeOrderFn === 'function') {
      (fyers as { placeOrder?: (req: unknown) => Promise<unknown> }).placeOrder =
        placeOrderFn.bind(fyers);
    }

    fastify.decorate('fyers', fyers);
    fastify.decorate('ensureFyersSession', ensureFyersSession);
  },
  { name: 'fyers' },
);

export default fyersPlugin;

export async function registerFyersPlugin(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(fyersPlugin);
}