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

export async function listTradeJournal(
  fastify: FastifyInstance,
  params: { symbol?: string; limit?: number } = {},
): Promise<{ entries: TradeJournalEntry[]; fetchedAt: string }> {
  const col = fastify.mongo?.db?.collection<TradeJournalEntry>(
    TRADE_JOURNAL_COLLECTION,
  );
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
  const col = fastify.mongo?.db?.collection<TradeJournalEntry>(
    TRADE_JOURNAL_COLLECTION,
  );
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
    positionId: string;
    exitNote?: string;
    optionTrigger?: string;
  },
): Promise<void> {
  const col = fastify.mongo?.db?.collection<TradeJournalEntry>(
    TRADE_JOURNAL_COLLECTION,
  );
  if (!col) return;

  const id = journalId(params.symbol, params.positionId);
  const patch: Partial<TradeJournalEntry> = {
    status: 'closed',
    exitAt: new Date().toISOString(),
    exitNote: params.exitNote ?? null,
    optionTriggerPending: false,
  };
  if (params.optionTrigger) {
    patch.optionTrigger = params.optionTrigger;
  }

  await col.updateOne({ id, status: 'open' }, { $set: patch });
}

const openPositionKeys = new Map<string, Set<string>>();

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
  const channelKey = `${params.symbol}|${params.tradingStyle}`;
  const prev = openPositionKeys.get(channelKey) ?? new Set<string>();
  const next = new Set(params.entries.map((e) => e.symbol));

  for (const entry of params.entries) {
    if (prev.has(entry.symbol)) continue;
    const side = entry.direction.startsWith('PE') ? 'PE' : 'CE';
    await recordJournalOpen(fastify, {
      symbol: params.symbol,
      tradingStyle: params.tradingStyle,
      positionId: entry.symbol,
      side,
      symbolLabel: entry.indexLabel,
      paTrigger: params.paTrigger,
      optionTrigger: params.optionTrigger,
      optionTriggerPending: !params.optionTrigger,
      entryNote: `${side} position opened`,
    });
  }

  for (const id of prev) {
    if (next.has(id)) continue;
    await recordJournalClose(fastify, {
      symbol: params.symbol,
      positionId: id,
      exitNote: 'Position closed',
      optionTrigger: params.optionTrigger,
    });
  }

  openPositionKeys.set(channelKey, next);

  if (params.optionTrigger) {
    for (const entry of params.entries) {
      await patchJournalOptionTrigger(fastify, {
        symbol: params.symbol,
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
  const col = fastify.mongo?.db?.collection<TradeJournalEntry>(
    TRADE_JOURNAL_COLLECTION,
  );
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