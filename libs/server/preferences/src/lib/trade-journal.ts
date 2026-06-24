import './augment-fastify.js';
import { FastifyInstance } from 'fastify';

export const TRADE_JOURNAL_COLLECTION = 'trade-journal';

export interface TradeJournalEntry {
  id: string;
  symbol: string;
  tradingStyle: string;
  side: 'CE' | 'PE' | 'UNKNOWN';
  symbolLabel?: string;
  entryAt: string;
  exitAt?: string | null;
  status: 'open' | 'closed';
  paTrigger?: string | null;
  optionTrigger?: string | null;
  optionTriggerPending?: boolean;
  entryNote?: string | null;
  exitNote?: string | null;
  positionId?: string | null;
}

export interface TradeJournalUpsertInput {
  symbol: string;
  tradingStyle: string;
  side?: 'CE' | 'PE' | 'UNKNOWN';
  symbolLabel?: string;
  positionId?: string;
  paTrigger?: string;
  optionTrigger?: string;
  optionTriggerPending?: boolean;
  entryNote?: string;
}

function journalId(symbol: string, positionId: string): string {
  return `${symbol}|${positionId}`;
}

function journalCollection(fastify: FastifyInstance) {
  return fastify.mongo?.db?.collection<TradeJournalEntry>(
    TRADE_JOURNAL_COLLECTION,
  );
}

export async function listTradeJournal(
  fastify: FastifyInstance,
  params: { symbol?: string; limit?: number } = {},
): Promise<{ entries: TradeJournalEntry[]; fetchedAt: string }> {
  const col = journalCollection(fastify);
  const fetchedAt = new Date().toISOString();
  if (!col) return { entries: [], fetchedAt };

  const filter: Record<string, string> = {};
  if (params.symbol?.trim()) filter.symbol = params.symbol.trim();

  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const entries = await col
    .find(filter)
    .sort({ entryAt: -1 })
    .limit(limit)
    .toArray();

  return { entries, fetchedAt };
}

export async function recordJournalOpen(
  fastify: FastifyInstance,
  input: TradeJournalUpsertInput,
): Promise<void> {
  const col = journalCollection(fastify);
  if (!col) return;

  const positionId = input.positionId?.trim() || `${Date.now()}`;
  const id = journalId(input.symbol, positionId);
  const now = new Date().toISOString();

  await col.updateOne(
    { id },
    {
      $setOnInsert: {
        id,
        symbol: input.symbol,
        tradingStyle: input.tradingStyle,
        side: input.side ?? 'UNKNOWN',
        symbolLabel: input.symbolLabel,
        entryAt: now,
        status: 'open',
        positionId,
        paTrigger: input.paTrigger ?? null,
        optionTrigger: input.optionTrigger ?? null,
        optionTriggerPending: input.optionTriggerPending ?? !input.optionTrigger,
        entryNote: input.entryNote ?? null,
      },
    },
    { upsert: true },
  );
}

export async function recordJournalClose(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    tradingStyle: string;
    positionId: string;
    side?: 'CE' | 'PE' | 'UNKNOWN';
    exitNote?: string;
    optionTrigger?: string;
  },
): Promise<void> {
  const col = journalCollection(fastify);
  if (!col) return;

  const positionId = params.positionId.trim();
  const id = journalId(params.symbol, positionId);
  const now = new Date().toISOString();
  const patch: Partial<TradeJournalEntry> = {
    status: 'closed',
    exitAt: now,
    exitNote: params.exitNote ?? null,
    optionTriggerPending: false,
  };
  if (params.optionTrigger) {
    patch.optionTrigger = params.optionTrigger;
  }

  const result = await col.updateOne({ id, status: 'open' }, { $set: patch });
  if (result.matchedCount > 0) return;

  // Close detected but open row was never written (missed sync / server restart).
  await col.updateOne(
    { id },
    {
      $setOnInsert: {
        id,
        symbol: params.symbol,
        tradingStyle: params.tradingStyle,
        side: params.side ?? 'UNKNOWN',
        entryAt: now,
        paTrigger: null,
        optionTrigger: params.optionTrigger ?? null,
        optionTriggerPending: false,
        entryNote: 'Entry time unknown — position was open before journal sync',
        positionId,
      },
      $set: {
        status: 'closed',
        exitAt: now,
        exitNote: params.exitNote ?? 'Position closed',
        optionTriggerPending: false,
        ...(params.optionTrigger ? { optionTrigger: params.optionTrigger } : {}),
      },
    },
    { upsert: true },
  );
}

export async function syncTradeJournalFromPositions(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    tradingStyle: string;
    entries: Array<{ symbol: string; direction: string; indexLabel?: string }>;
    paTrigger?: string;
    optionTrigger?: string;
  },
): Promise<void> {
  const col = journalCollection(fastify);
  if (!col) {
    fastify.log.warn(
      { symbol: params.symbol },
      'Trade journal sync skipped — MongoDB unavailable',
    );
    return;
  }

  const indexSymbol = params.symbol.trim();
  const next = new Set(
    params.entries.map((entry) => entry.symbol.trim()).filter(Boolean),
  );

  const openInDb = await col
    .find({ symbol: indexSymbol, status: 'open' })
    .project({ positionId: 1, side: 1 })
    .toArray();
  const openIds = new Set(
    openInDb
      .map((row) => row.positionId?.trim())
      .filter((id): id is string => Boolean(id)),
  );

  for (const entry of params.entries) {
    const positionId = entry.symbol.trim();
    if (!positionId || openIds.has(positionId)) continue;
    const side = entry.direction.startsWith('PE') ? 'PE' : 'CE';
    await recordJournalOpen(fastify, {
      symbol: indexSymbol,
      tradingStyle: params.tradingStyle,
      positionId,
      side,
      symbolLabel: entry.indexLabel,
      paTrigger: params.paTrigger,
      optionTrigger: params.optionTrigger,
      optionTriggerPending: !params.optionTrigger,
      entryNote: `${side} position opened`,
    });
  }

  for (const row of openInDb) {
    const positionId = row.positionId?.trim();
    if (!positionId || next.has(positionId)) continue;
    await recordJournalClose(fastify, {
      symbol: indexSymbol,
      tradingStyle: params.tradingStyle,
      positionId,
      side: row.side,
      exitNote: 'Position closed',
      optionTrigger: params.optionTrigger,
    });
  }

  if (params.optionTrigger) {
    for (const entry of params.entries) {
      await patchJournalOptionTrigger(fastify, {
        symbol: indexSymbol,
        positionId: entry.symbol,
        optionTrigger: params.optionTrigger,
      });
    }
  }
}

export async function patchJournalOptionTrigger(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    positionId: string;
    optionTrigger: string;
  },
): Promise<void> {
  const col = journalCollection(fastify);
  if (!col) return;

  const id = journalId(params.symbol, params.positionId);
  await col.updateOne(
    { id },
    {
      $set: {
        optionTrigger: params.optionTrigger,
        optionTriggerPending: false,
      },
    },
  );
}