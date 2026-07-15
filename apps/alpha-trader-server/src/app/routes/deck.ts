import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  buildDeckLiveEnrichmentPayload,
  buildDeckLiveFastPayload,
  buildDeckLivePayload,
  buildDeckLiveStreamEnrichment,
  buildDeckReplayPayload,
  buildDeckReplayTradesPayload,
  createDeckStreamSubscriber,
  fetchMarketNews,
} from '@alpha-trader/server-deck';
import { getQuoteCache, seedIndexQuotesFromRest } from '@alpha-trader/server-market-data';
import { buildSignalPresetGroupsResponse } from '@alpha-trader/server-benchmark';
import {
  buildAutoExitPolicyOptions,
  buildAutoExitPositionOptions,
  buildSettingsSnapshot,
  canAutoEntryToday,
  describeAutoEntryPreference,
  listTradeJournal,
  loadAutoEntrySession,
  type AutoEntryPreferenceState,
  type AutoExitPreferenceState,
  type SettingsPatch,
} from '@alpha-trader/server-preferences';
import { BENCHMARK_GREEN_DAY_STOP_MIN_R } from '@alpha-trader/server-shared';
import { isIndianMarketOpen, normalizeVetoMode } from '@alpha-trader/server-shared';

function writeSse(reply: FastifyReply, payload: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

type BootstrapQuote = {
  ltp?: number | null;
  ch?: number | null;
  chp?: number | null;
  updatedAt?: number | null;
};

async function buildDeckLiveBootstrapPayload(
  fastify: FastifyInstance,
  symbol: string,
): Promise<{
  symbol: string;
  symbolLabel: string;
  lastPrice: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  asOf: string;
}> {
  const trimmed = symbol.trim();
  let quote = (fastify.fyersMarketStream?.getQuote?.(trimmed) ??
    getQuoteCache().get(trimmed) ??
    null) as BootstrapQuote | null;
  if (!quote?.ltp || !Number.isFinite(quote.ltp) || quote.ltp <= 0) {
    await seedIndexQuotesFromRest(fastify, [trimmed]);
    quote = (fastify.fyersMarketStream?.getQuote?.(trimmed) ??
      getQuoteCache().get(trimmed) ??
      null) as BootstrapQuote | null;
  }
  const nowIso = new Date().toISOString();
  return {
    symbol: trimmed,
    symbolLabel: trimmed.split(':')[1]?.replace('-INDEX', '') ?? trimmed,
    lastPrice:
      quote?.ltp != null && Number.isFinite(quote.ltp) && quote.ltp > 0
        ? Number(quote.ltp)
        : null,
    dayChange: quote?.ch != null && Number.isFinite(quote.ch) ? Number(quote.ch) : null,
    dayChangePct:
      quote?.chp != null && Number.isFinite(quote.chp) ? Number(quote.chp) : null,
    asOf: quote?.updatedAt ? new Date(quote.updatedAt).toISOString() : nowIso,
  };
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
      if (closed) return;
      fastify.deckStreamHub.seedChartCandles(params, {
        spotCandles: enrichment.spotCandles,
        spotCandles5m: enrichment.spotCandles5m,
        spotCandles15m: enrichment.spotCandles15m,
        spotCandles1h: enrichment.spotCandles1h,
      });
      writeSse(reply, enrichment);
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
      if (scope === 'bootstrap') {
        return await buildDeckLiveBootstrapPayload(fastify, trimmedSymbol);
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

  fastify.get('/api/deck/auto-entry', async () => {
    const pref = fastify.preferences.getAutoEntry();
    const groups = buildSignalPresetGroupsResponse();
    const session = await loadAutoEntrySession(fastify);
    const gate = canAutoEntryToday(pref, session);
    return {
      ...pref,
      signalPresetGroups: groups,
      session: {
        entriesToday: session.entriesToday,
        dryRunsToday: session.dryRunsToday,
        maxEntriesPerDay: pref.maxEntriesPerDay,
        greenDayLocked: session.greenDayLocked,
        canEnter: gate.allowed,
        blockReason: gate.reason ?? null,
      },
      hints: describeAutoEntryPreference(pref),
      limits: {
        minLots: 1,
        maxLots: 20,
        minEntriesPerDay: 1,
        maxEntriesPerDay: 10,
        minEntryThreshold: 40,
        maxEntryThreshold: 85,
        greenDayMinR: BENCHMARK_GREEN_DAY_STOP_MIN_R,
      },
      warning:
        'When enabled, the server evaluates entry signals. Dry-run paper-trades without broker orders. Live MARKET buys require dry-run off and a separate live arm (resets each session day).',
    };
  });

  fastify.patch('/api/deck/auto-entry', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<AutoEntryPreferenceState>;
    const allowed = new Set(
      buildSignalPresetGroupsResponse().flatMap((g) =>
        g.presets.map((p) => p.id),
      ),
    );
    allowed.delete('engine');
    if (
      body.signalMode === 'single' &&
      body.signalProfile &&
      !allowed.has(String(body.signalProfile).trim())
    ) {
      return reply.code(400).send({ error: 'Unknown signal profile' });
    }
    try {
      const pref = await fastify.preferences.patchAutoEntry(body);
      const session = await loadAutoEntrySession(fastify);
      const gate = canAutoEntryToday(pref, session);
      return {
        ...pref,
        signalPresetGroups: buildSignalPresetGroupsResponse(),
        session: {
          entriesToday: session.entriesToday,
          dryRunsToday: session.dryRunsToday,
          maxEntriesPerDay: pref.maxEntriesPerDay,
          greenDayLocked: session.greenDayLocked,
          canEnter: gate.allowed,
          blockReason: gate.reason ?? null,
        },
        hints: describeAutoEntryPreference(pref),
        limits: {
          minLots: 1,
          maxLots: 20,
          minEntriesPerDay: 1,
          maxEntriesPerDay: 10,
          minEntryThreshold: 40,
          maxEntryThreshold: 85,
          greenDayMinR: BENCHMARK_GREEN_DAY_STOP_MIN_R,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck auto-entry patch failed');
      return reply.code(502).send({ error: message });
    }
  });

  fastify.get('/api/deck/news', async (request, reply) => {
    const { symbol, refresh } = request.query as {
      symbol?: string;
      refresh?: string;
    };
    if (!symbol?.trim()) {
      return reply.code(400).send({ error: 'symbol is required' });
    }
    try {
      return await fetchMarketNews(symbol.trim(), refresh === 'true');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck news fetch failed');
      return reply.code(502).send({ error: message });
    }
  });

  fastify.get('/api/deck/journal', async (request, reply) => {
    const { symbol, limit } = request.query as {
      symbol?: string;
      limit?: string;
    };
    try {
      return await listTradeJournal(fastify, {
        symbol: symbol?.trim(),
        limit: limit ? Number.parseInt(limit, 10) : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck journal fetch failed');
      return reply.code(502).send({ error: message });
    }
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

  fastify.get('/api/deck/funds', async (request, reply) => {
    const sessionReady = await fastify.ensureFyersSession();
    if (!sessionReady) {
      return reply.code(503).send({
        error: 'Fyers session expired — log in again.',
      });
    }
    try {
      const res = await (fastify.fyers as any).get_funds();
      if (res.s !== 'ok' || !res.fund_limit?.length) {
        return { available: 0, title: 'Equity', raw: [] };
      }
      const limits = res.fund_limit as Array<{ title?: string; equityAmount?: number }>;
      const equity = limits.find((l) => /equity|cash|available/i.test(l.title || '')) || limits[0];
      return {
        available: equity?.equityAmount || 0,
        title: equity?.title || 'Equity',
        raw: limits,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ err }, 'deck funds failed');
      return reply.code(502).send({ error: message });
    }
  });
}