/// <reference path="../fastify.d.ts" />
import type { PreferencesService } from '@alpha-trader/server-preferences';
import type { DeckStreamHub } from './deck-stream-hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    deckStreamHub: DeckStreamHub;
    preferences: PreferencesService;
  }
}