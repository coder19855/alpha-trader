import { HttpStatusCode } from 'axios';
import { FastifyInstance } from 'fastify';
import { ResponseStatus } from '@alpha-trader/server-shared';
import { upsertLatestAccessToken } from '@alpha-trader/server-auth';
import {
  buildPostLoginRedirect,
  clearWebNextCookie,
  setWebSessionCookie,
} from '../lib/web-session-cookie';

function resolveAuthCode(query: Record<string, unknown>): string | undefined {
  const authCode = query.auth_code ?? query.authCode;
  if (typeof authCode === 'string' && authCode.trim()) {
    return authCode.trim();
  }
  return undefined;
}

export default async function accessTokenRoutes(fastify: FastifyInstance) {
  fastify.get('/api/access-token', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const authCode = resolveAuthCode(query);

    if (!authCode) {
      return reply.code(HttpStatusCode.BadRequest).send({
        error: 'Missing auth code in query parameters',
        hint: 'Fyers redirects with ?auth_code=... — open /api/login first.',
        receivedQueryKeys: Object.keys(query),
      });
    }

    const secretKey = process.env.FYERS_API_SECRET || '';

    try {
      const authResponse = await fastify.fyers.generate_access_token({
        secret_key: secretKey,
        auth_code: authCode,
      });

      if (authResponse.s === ResponseStatus.ok) {
        fastify.fyers.setAccessToken(authResponse.access_token);
        await upsertLatestAccessToken(fastify, authResponse.access_token);

        const persisted = await fastify.fyers.getAccessToken();
        if (!persisted) {
          return reply.code(HttpStatusCode.ServiceUnavailable).send({
            error:
              'Fyers login succeeded but the access token could not be saved. Check MONGODB_URL and that MongoDB is running.',
          });
        }

        setWebSessionCookie(reply, request);
        const redirectTo = buildPostLoginRedirect(request);
        clearWebNextCookie(reply, request);

        const accept = request.headers.accept || '';
        if (accept.includes('text/html')) {
          return reply.redirect(redirectTo);
        }

        return reply.send({
          message: 'Authentication successful',
          redirectTo,
          accessToken: authResponse.access_token,
        });
      }

      return reply
        .status(authResponse.code ?? HttpStatusCode.BadRequest)
        .send({ error: authResponse.message });
    } catch (error) {
      return reply.code(HttpStatusCode.InternalServerError).send({ error });
    }
  });
}