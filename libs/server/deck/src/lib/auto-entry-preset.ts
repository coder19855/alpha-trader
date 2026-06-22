/// <reference path="../fastify.d.ts" />
import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { buildPriceActionSnapshot } from '@alpha-trader/server-analysis';
import {
  evaluateSignalProfile,
  profileNeedsChartPatterns,
  resolveSignalProfile,
} from '@alpha-trader/server-benchmark';
import { HeldDirection } from '@alpha-trader/server-position';
import { AutoEntryPresetSignalResolver } from './auto-entry-runner.js';
import {
  HISTORY_LOOKBACK_DAYS,
  PriceActionResponse,
  TradingStyle,
} from '@alpha-trader/server-shared';

async function fetchLivePaSnapshot(
  fastify: FastifyInstance,
  symbol: string,
  style: TradingStyle,
  withChartPatterns: boolean,
): Promise<PriceActionResponse | null> {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const rangeTo = Date.now();
  const toEpochSeconds = (ms: number) => Math.floor(ms / 1000).toString();
  const rangeFrom = toEpochSeconds(rangeTo - HISTORY_LOOKBACK_DAYS * MS_PER_DAY);
  const rangeToSec = toEpochSeconds(rangeTo);
  const base = {
    cont_flag: 1 as const,
    oi_flag: 0 as const,
    date_format: 0 as const,
  };

  const [res5m, res15m, res1h] = await Promise.all([
    fastify.fyers.getHistory({
      symbol,
      resolution: '5',
      range_from: rangeFrom,
      range_to: rangeToSec,
      ...base,
    }),
    fastify.fyers.getHistory({
      symbol,
      resolution: '15',
      range_from: rangeFrom,
      range_to: rangeToSec,
      ...base,
    }),
    fastify.fyers.getHistory({
      symbol,
      resolution: '60',
      range_from: rangeFrom,
      range_to: rangeToSec,
      ...base,
    }),
  ]);

  const candles5m = res5m.candles ?? [];
  const candles15m = res15m.candles ?? [];
  const candles1h = res1h.candles ?? [];
  if (!candles5m.length || !candles15m.length || !candles1h.length) {
    return null;
  }

  return buildPriceActionSnapshot(
    {
      ta: fastify.technicalAnalysisPlugin,
      momentum: fastify.momentumDecayPlugin,
    },
    {
      symbol,
      tradingStyle: style,
      candles5m,
      candles15m,
      candles1h,
      asOfMs: rangeTo,
      benchmarkReplay: !withChartPatterns,
    },
  );
}

export const resolveAutoEntryPresetSignal: AutoEntryPresetSignalResolver = async ({
  fastify,
  pref,
  decision,
  style,
  indexSymbol,
}): Promise<{ action: HeldDirection; reason: string } | null> => {
  const profile = resolveSignalProfile(pref.signalProfile);
  const snapshot =
    (decision._debug?.rawPrice as PriceActionResponse | undefined) ??
    (await fetchLivePaSnapshot(
      fastify,
      indexSymbol,
      style,
      profileNeedsChartPatterns(profile),
    ));
  if (!snapshot) return null;

  const match = evaluateSignalProfile(snapshot, profile, String(style));
  if (!match) return null;
  return {
    action: match.action,
    reason: `${profile.label}: ${match.reason}`,
  };
};