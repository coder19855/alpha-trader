import { FastifyInstance } from 'fastify';

type QuoteValue = {
  lp?: number;
  chp?: number;
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

/** Fyers SDK expects an array of symbols, not `{ symbols: [] }`. */
export async function fetchFyersQuotes(
  fastify: FastifyInstance,
  symbols: string[],
): Promise<QuotesPayload> {
  const fyers = fastify.fyers as {
    getQuotes: (req: string[] | { symbols: string[] }) => Promise<QuotesPayload>;
  };
  try {
    return await fyers.getQuotes(symbols);
  } catch {
    return await fyers.getQuotes({ symbols });
  }
}

export function parseSpotFromQuotes(
  payload: QuotesPayload | null | undefined,
  symbol: string,
): { ltp: number; changePercent: number } | null {
  if (!payload || payload.s !== 'ok') return null;
  const rows = Array.isArray(payload.d)
    ? payload.d
    : payload.d
      ? [payload.d]
      : [];
  const row =
    rows.find((r) => r.n === symbol) ??
    rows[0];
  const v = row?.v;
  const ltp = Number(v?.lp ?? v?.cmd?.lp ?? 0);
  const changePercent = Number(v?.chp ?? 0);
  if (!Number.isFinite(ltp) || ltp <= 0) return null;
  return { ltp, changePercent };
}

export async function resolveSpotLtp(
  fastify: FastifyInstance,
  symbol: string,
): Promise<{ ltp: number; changePercent: number } | null> {
  const streamLtp = fastify.fyersMarketStream?.getIndexLtp(symbol);
  if (streamLtp != null && Number.isFinite(streamLtp) && streamLtp > 0) {
    return { ltp: streamLtp, changePercent: 0 };
  }

  try {
    const quotes = await fetchFyersQuotes(fastify, [symbol]);
    return parseSpotFromQuotes(quotes, symbol);
  } catch {
    return null;
  }
}