import { FastifyInstance } from 'fastify';
import {
  buildSettingsSnapshot,
  type SettingsPatch,
} from '@alpha-trader/server-preferences';

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/settings', async () => {
    const stored = fastify.preferences.getSettings();
    return buildSettingsSnapshot(stored, fastify.preferences.canPersist());
  });

  fastify.patch('/api/settings', async (request, reply) => {
    const body = (request.body ?? {}) as SettingsPatch;
    try {
      const stored = await fastify.preferences.patchSettings(body);
      return buildSettingsSnapshot(stored, fastify.preferences.canPersist());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'settings patch failed');
      return reply.code(502).send({ error: message });
    }
  });
}