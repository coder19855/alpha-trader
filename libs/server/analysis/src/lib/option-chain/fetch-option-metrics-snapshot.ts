import '../augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { FyersAPI } from 'fyers-api-v3';
import { OptionMetricsResponse, TradingStyle } from '@alpha-trader/server-shared';

import { computeOptionMetricsFromChain } from './compute-option-metrics.js';
import { resolveSpotLtp } from './resolve-spot-ltp.js';
import {
  OptionOverlayStatus,
  setOptionOverlay,
} from './option-overlay-cache.js';

/**
 * Fetch + compute option-chain metrics for a single symbol and map them to the
 * lean {@link OptionMetricsResponse} the decision engine consumes.
 *
 * This is the background-safe sibling of the `/api/option-chain` route: it
 * never throws and resolves to `null` on any failure (no session, no spot, bad
 * chain, compute error), so a flaky option feed can only withhold the overlay,
 * never crash the refresher or block the deck tick.
 */
export async function fetchOptionMetricsSnapshot(
  fastify: FastifyInstance,
  symbol: string,
  tradingStyle: TradingStyle,
): Promise<OptionMetricsResponse | null> {
  try {
    const sessionReady = await (
      fastify as FastifyInstance & {
        ensureFyersSession?: () => Promise<boolean>;
      }
    ).ensureFyersSession?.();
    if (sessionReady === false) return null;

    const spot = await resolveSpotLtp(fastify, symbol);
    if (!spot) return null;

    let chainRes: FyersAPI.OptionChainResponse;
    try {
      chainRes = await fastify.fyers.getOptionChain({
        symbol,
        strikecount: 12,
        timestamp: '',
        greeks: 1,
      } as FyersAPI.OptionChainRequest);
    } catch {
      return null;
    }

    if (chainRes.s !== 'ok' || !chainRes.data?.optionsChain?.length) {
      return null;
    }

    const sr = fastify.supportResistancePlugin?.getSupportResistance(
      chainRes.data.optionsChain,
    );

    const computed = computeOptionMetricsFromChain({
      chain: chainRes.data.optionsChain,
      spotLtp: spot.ltp,
      spotLtpChangePercent: spot.changePercent,
      indiaVix: chainRes.data.indiavixData?.ltp ?? 0,
      tradingStyle,
      supportResistance: sr,
      utils: fastify.utilsPlugin,
    });

    return {
      spotSymbol: symbol,
      spotLtp: spot.ltp,
      spotLtpChangePercent: spot.changePercent,
      score: computed.score,
      signal: computed.signal,
      bias: computed.bias,
      ivRegime: computed.ivRegime,
      confidence: computed.confidence,
      components: computed.components,
    };
  } catch (err) {
    fastify.log?.warn?.({ err, symbol }, 'option overlay snapshot failed');
    return null;
  }
}

/**
 * Refresh the overlay cache for one symbol/style. Returns the resulting status
 * so the caller can log coverage. Always resolves — never rejects.
 */
export async function refreshOptionOverlay(
  fastify: FastifyInstance,
  symbol: string,
  tradingStyle: TradingStyle,
): Promise<OptionOverlayStatus> {
  const metrics = await fetchOptionMetricsSnapshot(fastify, symbol, tradingStyle);
  if (!metrics) return 'missing';
  setOptionOverlay(symbol, tradingStyle, metrics, Date.now());
  return 'fresh';
}
