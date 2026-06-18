import { FyersAPI } from 'fyers-api-v3';
import { FYERS_HISTORY_CHUNK_TIMEOUT_MS } from '@alpha-trader/server-shared';
import { toErrorMessage } from '@alpha-trader/server-shared';
import { withTimeout } from '@alpha-trader/server-shared';
import { ResponseStatus } from '@alpha-trader/server-shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Fyers V3 history cap for intraday resolutions (5m, 15m, 60m, etc.). */
export const FYERS_HISTORY_MAX_DAYS_PER_REQUEST = 100;

export function buildHistoryChunkRanges(
  fromMs: number,
  toMs: number,
  maxDaysPerChunk = FYERS_HISTORY_MAX_DAYS_PER_REQUEST,
): Array<{ fromMs: number; toMs: number }> {
  if (toMs <= fromMs) return [];

  const maxSpanMs = maxDaysPerChunk * MS_PER_DAY;
  const chunks: Array<{ fromMs: number; toMs: number }> = [];
  let cursor = fromMs;

  while (cursor < toMs) {
    const end = Math.min(toMs, cursor + maxSpanMs);
    chunks.push({ fromMs: cursor, toMs: end });
    if (end >= toMs) break;
    cursor = end + 1000;
  }

  return chunks;
}

export function mergeFyersCandles(
  batches: FyersAPI.Candle[][],
): FyersAPI.Candle[] {
  const byTs = new Map<number, FyersAPI.Candle>();
  for (const batch of batches) {
    for (const candle of batch) {
      byTs.set(candle[0], candle);
    }
  }
  return [...byTs.values()].sort((a, b) => a[0] - b[0]);
}

type FyersHistoryClient = {
  getHistory: (params: FyersAPI.HistoryQueryRequest) => Promise<FyersAPI.HistoryResponse>;
};

type FyersBinaryFlag = 0 | 1;

export async function fetchFyersHistoryCandles(
  fyers: FyersHistoryClient,
  params: {
    symbol: string;
    resolution: string;
    fromMs: number;
    toMs: number;
    cont_flag?: FyersBinaryFlag;
    oi_flag?: FyersBinaryFlag;
    date_format?: FyersBinaryFlag;
  },
): Promise<FyersAPI.Candle[]> {
  const chunks = buildHistoryChunkRanges(params.fromMs, params.toMs);
  const toEpochSeconds = (ms: number) => Math.floor(ms / 1000).toString();
  const cont_flag: FyersBinaryFlag = params.cont_flag ?? 1;
  const oi_flag: FyersBinaryFlag = params.oi_flag ?? 0;
  const date_format: FyersBinaryFlag = params.date_format ?? 0;
  const batches: FyersAPI.Candle[][] = [];

  for (const chunk of chunks) {
    const res = await withTimeout(
      fyers.getHistory({
        symbol: params.symbol,
        resolution: params.resolution,
        range_from: toEpochSeconds(chunk.fromMs),
        range_to: toEpochSeconds(chunk.toMs),
        cont_flag,
        oi_flag,
        date_format,
      }),
      FYERS_HISTORY_CHUNK_TIMEOUT_MS,
      `Fyers history ${params.symbol} ${params.resolution}`,
    );

    if (res.s !== ResponseStatus.ok) {
      const detail = toErrorMessage(res);
      const hint =
        detail.includes('Invalid symbol') || String(res.code) === '-300'
          ? ` Check symbol is a Fyers index spot (e.g. NSE:NIFTY50-INDEX, NSE:NIFTYBANK-INDEX — not NSE:BANKNIFTY-INDEX).`
          : '';
      throw new Error(
        detail.includes(params.symbol)
          ? `${detail}${hint}`
          : `${detail} (symbol: ${params.symbol}, resolution: ${params.resolution})${hint}`,
      );
    }

    if (res.candles?.length) {
      batches.push(res.candles);
    }
  }

  return mergeFyersCandles(batches);
}