import { FastifyInstance } from 'fastify';
import { getQuoteCache, LiveQuote } from './quote-cache.js';

type QuoteValue = {
  lp?: number;
  ch?: number;
  chp?: number;
  ltpch?: number;
  ltpchp?: number;
  cmd?: { lp?: number };
};

type QuoteRow = {
  n?: string;
  v?: QuoteValue;
};

type QuotesPayload = {
  s?: string;
  d?: QuoteRow | QuoteRow[];
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseQuoteRow(row: QuoteRow): LiveQuote | null {
  const symbol = row.n?.trim();
  const v = row.v;
  if (!symbol || !v) return null;

  const ltp = num(v.lp ?? v.cmd?.lp);
  if (ltp <= 0) return null;

  const ch = num(v.ch ?? v.ltpch);
  const chp = num(v.chp ?? v.ltpchp);
  const prevClose = ch !== 0 ? ltp - ch : undefined;

  return {
    symbol,
    ltp,
    ch,
    chp,
    prevClose,
    updatedAt: Date.now(),
    source: 'rest',
  };
}

async function fetchQuotesPayload(
  fastify: FastifyInstance,
  symbols: string[],
): Promise<QuotesPayload | null> {
  if (!symbols.length) return null;
  const fyers = fastify.fyers as {
    getQuotes: (req: string[] | { symbols: string[] }) => Promise<QuotesPayload>;
  };
  try {
    return await fyers.getQuotes(symbols);
  } catch {
    try {
      return await fyers.getQuotes({ symbols });
    } catch {
      return null;
    }
  }
}

/** REST seed for index day-change fields (WS lite ticks often omit ch/chp). */
export async function seedIndexQuotesFromRest(
  fastify: FastifyInstance,
  symbols: string[],
): Promise<number> {
  const unique = [...new Set(symbols.filter(Boolean))];
  if (!unique.length) return 0;

  const payload = await fetchQuotesPayload(fastify, unique);
  if (!payload || payload.s !== 'ok') return 0;

  const rows = Array.isArray(payload.d)
    ? payload.d
    : payload.d
      ? [payload.d]
      : [];

  const cache = getQuoteCache();
  let seeded = 0;
  for (const row of rows) {
    const quote = parseQuoteRow(row);
    if (!quote) continue;
    cache.upsert(quote);
    seeded += 1;
  }
  return seeded;
}