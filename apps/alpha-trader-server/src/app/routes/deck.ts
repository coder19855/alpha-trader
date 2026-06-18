import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  buildDeckLiveEnrichmentPayload,
  buildDeckLiveFastPayload,
  buildDeckLivePayload,
  buildDeckLiveStreamEnrichment,
  buildDeckReplayPayload,
  buildDeckReplayTradesPayload,
  createDeckStreamSubscriber,
} from '@alpha-trader/server-deck';
import {
  buildAutoExitPolicyOptions,
  buildAutoExitPositionOptions,
  buildSettingsSnapshot,
  type AutoExitPreferenceState,
  type SettingsPatch,
} from '@alpha-trader/server-preferences';
import { isIndianMarketOpen, normalizeVetoMode } from '@alpha-trader/server-shared';

function writeSse(reply: FastifyReply, payload: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function handleDeckStream(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  params: { symbol: string; tradingStyle?: string },
): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  request.raw.on('close', () => {
    closed = true;
    unsubscribe?.();
  });

  writeSse(reply, {
    type: 'status',
    message: 'Connected',
    phase: 'connecting',
  });

  if (!isIndianMarketOpen()) {
    writeSse(reply, {
      type: 'status',
      message: 'Market closed — live ticks paused',
      phase: 'closed',
    });
  }

  const subscriber = createDeckStreamSubscriber(reply, () => closed);
  const unsubscribe = fastify.deckStreamHub.subscribe(params, subscriber);

  void buildDeckLiveStreamEnrichment(fastify, params)
    .then((enrichment) => {
      if (!closed) writeSse(reply, enrichment);
    })
    .catch((err) => {
      fastify.log.warn({ err }, 'deck stream enrichment failed');
    });
}

export default async function deckRoutes(fastify: FastifyInstance) {
  fastify.get('/api/deck/stream', async (request, reply) => {
    const { symbol, style } = request.query as {
      symbol?: string;
      style?: string;
    };
    if (!symbol?.trim()) {
      return reply.code(400).send({ error: 'symbol is required' });
    }

    const sessionReady = await fastify.ensureFyersSession();
    if (!sessionReady) {
      return reply.code(503).send({
        error: 'Fyers session expired — log in again.',
      });
    }

    handleDeckStream(fastify, request, reply, {
      symbol: symbol.trim(),
      tradingStyle: style,
    });
  });

  fastify.get('/api/deck/live', async (request, reply) => {
    const { symbol, style, scope } = request.query as {
      symbol?: string;
      style?: string;
      scope?: string;
    };
    if (!symbol?.trim()) {
      return reply.code(400).send({ error: 'symbol is required' });
    }

    const sessionReady = await fastify.ensureFyersSession();
    if (!sessionReady) {
      return reply.code(503).send({
        error: 'Fyers session expired — log in again.',
      });
    }

    try {
      const trimmedSymbol = symbol.trim();
      if (scope === 'enrichment') {
        return await buildDeckLiveEnrichmentPayload(fastify, {
          symbol: trimmedSymbol,
          tradingStyle: style,
        });
      }
      if (scope === 'fast') {
        return await buildDeckLiveFastPayload(fastify, {
          symbol: trimmedSymbol,
          tradingStyle: style,
        });
      }
      return await buildDeckLivePayload(fastify, {
        symbol: trimmedSymbol,
        tradingStyle: style,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck live failed');
      return reply.code(502).send({ error: message });
    }
  });

  fastify.get('/api/deck/replay', async (request, reply) => {
    const { symbol, style, date } = request.query as {
      symbol?: string;
      style?: string;
      date?: string;
    };
    if (!symbol?.trim()) {
      return reply.code(400).send({ error: 'symbol is required' });
    }

    const sessionReady = await fastify.ensureFyersSession();
    if (!sessionReady) {
      return reply.code(503).send({
        error: 'Fyers session expired — log in again.',
      });
    }

    try {
      return await buildDeckReplayPayload(fastify, {
        symbol: symbol.trim(),
        tradingStyle: style,
        sessionDate: date,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck replay failed');
      return reply.code(502).send({ error: message });
    }
  });

  fastify.get('/api/deck/replay-trades', async (request, reply) => {
    const { symbol, style, date } = request.query as {
      symbol?: string;
      style?: string;
      date?: string;
    };
    if (!symbol?.trim()) {
      return reply.code(400).send({ error: 'symbol is required' });
    }
    if (!date?.trim()) {
      return reply.code(400).send({ error: 'date is required (YYYY-MM-DD)' });
    }

    try {
      return await buildDeckReplayTradesPayload(fastify, {
        symbol: symbol.trim(),
        tradingStyle: style,
        sessionDate: date.trim(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck replay trades failed');
      return reply.code(502).send({ error: message });
    }
  });

  fastify.get('/api/deck/settings', async () => {
    const stored = fastify.preferences.getSettings();
    return buildSettingsSnapshot(stored, fastify.preferences.canPersist());
  });

  fastify.patch('/api/deck/settings', async (request, reply) => {
    const body = (request.body ?? {}) as SettingsPatch;
    try {
      const stored = await fastify.preferences.patchSettings(body);
      return buildSettingsSnapshot(stored, fastify.preferences.canPersist());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck settings patch failed');
      return reply.code(502).send({ error: message });
    }
  });

  fastify.get('/api/deck/auto-exit', async () => {
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

  fastify.patch('/api/deck/auto-exit', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<AutoExitPreferenceState>;
    try {
      const pref = await fastify.preferences.patchAutoExit(body);
      return {
        ...pref,
        confirmationsRequired: 1 + pref.retestCount,
        exitPolicies: buildAutoExitPolicyOptions(),
        positionPolicies: buildAutoExitPositionOptions(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck auto-exit patch failed');
      return reply.code(502).send({ error: message });
    }
  });

  fastify.post('/api/deck/veto', async (request, reply) => {
    const body = (request.body ?? {}) as { mode?: string };
    const vetoMode = normalizeVetoMode(body.mode);
    try {
      await fastify.preferences.patchSettings({ vetoMode });
      return { vetoMode };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck veto patch failed');
      return reply.code(502).send({ error: message });
    }
  });
}