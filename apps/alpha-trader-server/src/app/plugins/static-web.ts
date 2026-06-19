import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

function resolveWebDistRoot(): string | null {
  const fromEnv = process.env.WEB_DIST_PATH?.trim();
  if (fromEnv && fs.existsSync(path.join(fromEnv, 'index.html'))) {
    return fromEnv;
  }

  const candidates = [
    path.resolve(process.cwd(), 'dist/apps/alpha-trader-web/browser'),
    path.resolve(__dirname, '../../../../dist/apps/alpha-trader-web/browser'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return null;
}

export function shouldServeWebApp(): boolean {
  if (process.env.SERVE_WEB_APP === 'true') return true;
  if (process.env.SERVE_WEB_APP === 'false') return false;
  return resolveWebDistRoot() != null;
}

export async function registerStaticWebPlugin(
  fastify: FastifyInstance,
): Promise<void> {
  if (!shouldServeWebApp()) {
    fastify.log.info('Web dist not found — API-only mode (no static file serving)');
    return;
  }

  const root = resolveWebDistRoot();
  if (!root) {
    fastify.log.warn('SERVE_WEB_APP is set but web dist was not found');
    return;
  }

  await fastify.register(fastifyStatic, {
    root,
    wildcard: false,
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });

  fastify.log.info({ root }, 'Serving Angular web app from dist');
}