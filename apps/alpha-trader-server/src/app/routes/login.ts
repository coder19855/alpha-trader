import { HttpStatusCode } from 'axios';
import { FastifyInstance } from 'fastify';
import {
  buildPostLoginRedirect,
  clearWebNextCookie,
  readWebNextPath,
  setWebNextCookie,
  setWebSessionCookie,
} from '../lib/web-session-cookie';

function isTruthyQueryFlag(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export default async function loginRoutes(fastify: FastifyInstance) {
  fastify.get('/api/login', async (request, reply) => {
    try {
      const { forceRedirect, forceRelogin } = request.query as {
        forceRedirect?: string;
        forceRelogin?: string;
      };
      const shouldRedirect = isTruthyQueryFlag(forceRedirect);
      const shouldForceRelogin = isTruthyQueryFlag(forceRelogin);

      await fastify.fyers.initialize();
      const isTokenValid = await fastify.fyers.isTokenValid();

      if (isTokenValid && !shouldForceRelogin) {
        if (shouldRedirect) {
          setWebSessionCookie(reply, request);
          const dest = buildPostLoginRedirect(request);
          clearWebNextCookie(reply, request);
          return reply.redirect(dest);
        }
        return reply.code(HttpStatusCode.Ok).send({ hasActiveToken: true });
      }

      const redirectUrl = fastify.fyers.generateAuthCode();
      if (shouldRedirect) {
        return reply.redirect(redirectUrl);
      }

      return reply
        .code(HttpStatusCode.Ok)
        .send({ hasActiveToken: false, redirectUrl });
    } catch (error) {
      return reply.code(HttpStatusCode.InternalServerError).send({ error });
    }
  });

  fastify.get('/api/login/browser', async (request, reply) => {
    const { forceRelogin, next } = request.query as {
      forceRelogin?: string;
      next?: string;
    };
    const shouldForceRelogin = isTruthyQueryFlag(forceRelogin);
    setWebNextCookie(reply, next || readWebNextPath(request), request);

    try {
      await fastify.fyers.initialize();
      const isTokenValid = await fastify.fyers.isTokenValid();
      if (isTokenValid && !shouldForceRelogin) {
        setWebSessionCookie(reply, request);
        const dest = buildPostLoginRedirect(request);
        clearWebNextCookie(reply, request);
        return reply.redirect(dest);
      }
      return reply.redirect(fastify.fyers.generateAuthCode());
    } catch (error) {
      return reply.code(HttpStatusCode.InternalServerError).send({ error });
    }
  });
}