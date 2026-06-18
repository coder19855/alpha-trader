import '@alpha-trader/server-auth';
import type { PreferencesService } from './register-preferences-plugin.js';

declare module 'fastify' {
  interface FastifyInstance {
    preferences: PreferencesService;
  }
}