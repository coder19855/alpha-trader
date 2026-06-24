import { FastifyInstance } from 'fastify';
import {
  buildAutoExitPolicyOptions,
  buildAutoExitPositionOptions,
  type AutoExitPreferenceState,
} from '@alpha-trader/server-preferences';

export default async function autoExitRoutes(fastify: FastifyInstance) {
  fastify.get('/api/auto-exit', async () => {
    const pref = fastify.preferences.getAutoExit();
    return {
      ...pref,
      confirmationsRequired: 1 + pref.retestCount,
      exitPolicies: buildAutoExitPolicyOptions(),
      positionPolicies: buildAutoExitPositionOptions(),
      warning:
        'When enabled, the server may place MARKET sell orders to square off watched index option legs when benchmark exit rules confirm.',
    };
  });

  fastify.patch('/api/auto-exit', async (request, reply) => {
    const body = (request.body ?? {}) as {
      enabled?: boolean;
      retestCount?: number;
      signalFlipExit?: boolean;
      exitPolicy?: string;
      positionPolicy?: string;
      optionPremiumExit?: boolean;
      optionPremiumStopPct?: number;
    };
    try {
      const pref = await fastify.preferences.patchAutoExit(
        body as Partial<AutoExitPreferenceState>,
      );
      return {
        ...pref,
        confirmationsRequired: 1 + pref.retestCount,
        exitPolicies: buildAutoExitPolicyOptions(),
        positionPolicies: buildAutoExitPositionOptions(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'auto-exit patch failed');
      return reply.code(502).send({ error: message });
    }
  });
}