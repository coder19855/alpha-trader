import * as path from 'path';
import { FastifyInstance } from 'fastify';
import AutoLoad from '@fastify/autoload';
import corePlugin from './plugins/core';
import { registerStaticWebPlugin } from './plugins/static-web';

/* eslint-disable-next-line */
export interface AppOptions { }

export async function app(fastify: FastifyInstance, opts: AppOptions) {
  await fastify.register(corePlugin);

  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: { ...opts },
    ignoreFilter: (p) => p.includes('core'),
  });

  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: { ...opts },
    ignoreFilter: (p) => p.includes('.spec.'),
  });

  await registerStaticWebPlugin(fastify);
}
