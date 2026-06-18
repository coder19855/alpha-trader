import * as path from 'path';
import { FastifyInstance } from 'fastify';
import AutoLoad from '@fastify/autoload';
import corePlugin from './plugins/core';

/* eslint-disable-next-line */
export interface AppOptions { }

export async function app(fastify: FastifyInstance, opts: AppOptions) {
  await fastify.register(corePlugin);

  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: { ...opts },
    ignoreFilter: (p) => p.includes('core'),
  });

  // This loads all plugins defined in routes
  // define your routes in one of these
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: { ...opts },
  });
}
