import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { FyersAPI } from 'fyers-api-v3';
import {
  HISTORY_LOOKBACK_DAYS,
  PriceActionResponse,
  ResponseStatus,
  TradingStyle,
  VetoMode,
} from '@alpha-trader/server-shared';
import { patchLiveHistoryCandles } from '@alpha-trader/server-market-data';
import { buildPriceActionSnapshot } from './technical-analysis/snapshot.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTradingStyle(styleQuery?: string): TradingStyle {
  const style = String(styleQuery || TradingStyle.Intraday).toUpperCase();
  if (style === 'SCALPER' || style === TradingStyle.Scalper) {
    return TradingStyle.Scalper;
  }
  if (style === 'POSITIONAL' || style === TradingStyle.Positional) {
    return TradingStyle.Positional;
  }
  return TradingStyle.Intraday;
}

export interface LiveMtfCandles {
  candles5m: FyersAPI.Candle[];
  candles15m: FyersAPI.Candle[];
  candles1h: FyersAPI.Candle[];
  rangeToMs: number;
}

export async function fetchLiveMtfCandles(
  fastify: FastifyInstance,
  symbol: string,
  rangeToMs?: number,
): Promise<LiveMtfCandles | null> {
  const trimmed = symbol.trim();
  let rangeTo = rangeToMs ?? Date.now();
  if (rangeTo < 10_000_000_000) rangeTo *= 1000;

  const toEpochSeconds = (ms: number) => Math.floor(ms / 1000).toString();
  const formattedRangeTo = toEpochSeconds(rangeTo);
  const rangeFrom = toEpochSeconds(rangeTo - HISTORY_LOOKBACK_DAYS * MS_PER_DAY);
  const base = {
    cont_flag: 1 as const,
    oi_flag: 0 as const,
    date_format: 0 as const,
  };

  const [res5m, res15m, res1h] = await Promise.all([
    fastify.fyers.getHistory({
      symbol: trimmed,
      resolution: '5',
      range_from: rangeFrom,
      range_to: formattedRangeTo,
      ...base,
    }),
    fastify.fyers.getHistory({
      symbol: trimmed,
      resolution: '15',
      range_from: rangeFrom,
      range_to: formattedRangeTo,
      ...base,
    }),
    fastify.fyers.getHistory({
      symbol: trimmed,
      resolution: '60',
      range_from: rangeFrom,
      range_to: formattedRangeTo,
      ...base,
    }),
  ]);

  if (
    res5m.s !== ResponseStatus.ok ||
    res15m.s !== ResponseStatus.ok ||
    res1h.s !== ResponseStatus.ok
  ) {
    return null;
  }

  const liveLtp = fastify.fyersMarketStream?.getIndexLtp(trimmed) ?? null;
  const patched = patchLiveHistoryCandles(
    trimmed,
    {
      '5': res5m.candles ?? [],
      '15': res15m.candles ?? [],
      '60': res1h.candles ?? [],
    },
    liveLtp,
    Math.floor(rangeTo / 1000),
  );

  const candles5m = patched['5'];
  const candles15m = patched['15'];
  const candles1h = patched['60'];
  if (!candles5m.length || !candles15m.length || !candles1h.length) {
    return null;
  }

  return { candles5m, candles15m, candles1h, rangeToMs: rangeTo };
}

export async function computeLivePriceAction(
  fastify: FastifyInstance,
  params: {
    symbol: string;
    tradingStyle?: string | TradingStyle;
    vetoMode?: VetoMode;
    rangeToMs?: number;
    benchmarkReplay?: boolean;
  },
): Promise<PriceActionResponse | null> {
  const mtf = await fetchLiveMtfCandles(
    fastify,
    params.symbol,
    params.rangeToMs,
  );
  if (!mtf) return null;

  const tradingStyle = parseTradingStyle(
    typeof params.tradingStyle === 'string'
      ? params.tradingStyle
      : params.tradingStyle ?? TradingStyle.Intraday,
  );

  return buildPriceActionSnapshot(
    {
      ta: fastify.technicalAnalysisPlugin,
      momentum: fastify.momentumDecayPlugin,
    },
    {
      symbol: params.symbol.trim(),
      tradingStyle,
      candles5m: mtf.candles5m,
      candles15m: mtf.candles15m,
      candles1h: mtf.candles1h,
      asOfMs: mtf.rangeToMs,
      entryVetoMode: params.vetoMode,
      benchmarkReplay: params.benchmarkReplay,
    },
  );
}