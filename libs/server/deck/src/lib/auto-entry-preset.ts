/// <reference path="../fastify.d.ts" />
import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import {
  buildPriceActionSnapshot,
  fetchLiveMtfCandles,
} from '@alpha-trader/server-analysis';
import {
  evaluateSignalProfile,
  profileNeedsChartPatterns,
  resolveSignalProfile,
} from '@alpha-trader/server-benchmark';
import { HeldDirection } from '@alpha-trader/server-position';
import { AutoEntryPresetSignalResolver } from './auto-entry-runner.js';
import {
  PriceActionResponse,
  TradingStyle,
} from '@alpha-trader/server-shared';

async function fetchLivePaSnapshot(
  fastify: FastifyInstance,
  symbol: string,
  style: TradingStyle,
  withChartPatterns: boolean,
): Promise<PriceActionResponse | null> {
  const mtf = await fetchLiveMtfCandles(fastify, symbol);
  if (!mtf) return null;

  return buildPriceActionSnapshot(
    {
      ta: fastify.technicalAnalysisPlugin,
      momentum: fastify.momentumDecayPlugin,
    },
    {
      symbol,
      tradingStyle: style,
      candles5m: mtf.candles5m,
      candles15m: mtf.candles15m,
      candles1h: mtf.candles1h,
      asOfMs: mtf.rangeToMs,
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