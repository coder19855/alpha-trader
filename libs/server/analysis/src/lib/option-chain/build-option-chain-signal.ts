import type { FastifyInstance } from 'fastify';
import { FyersAPI } from 'fyers-api-v3';
import {
  FYERS_OPTION_INDEX_SYMBOLS,
  GreeksMoneyness,
  OptionChainSignalResponse,
  OPTION_CHAIN_POLL_DEFAULT_MS,
  TradingStyle,
  normalizeOptionChainPollMs,
  normalizeVetoMode,
} from '@alpha-trader/server-shared';
import { fyersErrorMessage } from './fyers-error.js';
import { resolveSpotLtp } from './resolve-spot-ltp.js';
import {
  computeOptionMetricsFromChain,
  estimateRiskPerLot,
  resolvePaAlignment,
} from './compute-option-metrics.js';
import {
  getCachedOptionChain,
  optionChainCacheKey,
  setCachedOptionChain,
} from './option-chain-cache.js';

export interface BuildOptionChainSignalParams {
  symbol: string;
  tradingStyle: TradingStyle;
  paAction?: string;
  moneyness?: GreeksMoneyness;
  optionSide?: 'CE' | 'PE';
  forceRefresh?: boolean;
}

function resolveLotSize(symbol: string): number {
  const meta = FYERS_OPTION_INDEX_SYMBOLS.find((r) => r.symbol === symbol);
  return meta?.lotSize ?? 65;
}

function resolveSettings(
  fastify: FastifyInstance,
): {
  vetoMode: string;
  optionChainPollMs: number;
} {
  const prefs = (
    fastify as FastifyInstance & {
      preferences?: {
        getSettings: () => {
          vetoMode: string;
          tradingStyle: TradingStyle;
          optionChainPollMs?: number;
        };
      };
    }
  ).preferences;
  const settings = prefs?.getSettings?.() ?? {
    vetoMode: 'strict',
    tradingStyle: TradingStyle.Intraday,
    optionChainPollMs: OPTION_CHAIN_POLL_DEFAULT_MS,
  };
  return {
    vetoMode: normalizeVetoMode(settings.vetoMode, 'strict'),
    optionChainPollMs: normalizeOptionChainPollMs(settings.optionChainPollMs),
  };
}

export async function buildOptionChainSignalResponse(
  fastify: FastifyInstance,
  params: BuildOptionChainSignalParams,
): Promise<OptionChainSignalResponse> {
  const symbol = params.symbol.trim();
  const tradingStyle = params.tradingStyle;
  const { vetoMode, optionChainPollMs } = resolveSettings(fastify);
  const cacheTtlMs = optionChainPollMs > 0 ? optionChainPollMs : 60_000;

  const cacheKey = optionChainCacheKey(
    symbol,
    tradingStyle,
    params.moneyness,
    params.optionSide,
  );

  if (!params.forceRefresh) {
    const cached = getCachedOptionChain(cacheKey);
    if (cached) {
      const alignment = resolvePaAlignment(params.paAction, cached.signal, vetoMode);
      return {
        ...cached,
        paAlignment: alignment.alignment,
        paAlignmentDetail: alignment.detail,
      };
    }
  }

  const sessionReady = await (
    fastify as FastifyInstance & {
      ensureFyersSession?: (opts?: { verifyWithApi?: boolean }) => Promise<boolean>;
    }
  ).ensureFyersSession?.();
  if (sessionReady === false) {
    throw new Error(
      'Fyers is not connected. Log in via Connect Fyers, then refresh option chain.',
    );
  }

  const spot = await resolveSpotLtp(fastify, symbol);
  if (!spot) {
    throw new Error(
      'Unable to resolve spot LTP. Check Fyers connection and that the symbol is valid.',
    );
  }

  let chainRes: FyersAPI.OptionChainResponse;
  try {
    chainRes = await fastify.fyers.getOptionChain({
      symbol,
      strikecount: 12,
      timestamp: '',
      greeks: 1,
    } as FyersAPI.OptionChainRequest);
  } catch (chainErr: unknown) {
    throw new Error(fyersErrorMessage(chainErr));
  }

  if (chainRes.s !== 'ok' || !chainRes.data?.optionsChain?.length) {
    throw new Error(
      (chainRes as { error?: string }).error ||
        'Option chain unavailable from Fyers',
    );
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
    moneyness: params.moneyness,
    optionSide: params.moneyness ? params.optionSide : undefined,
    utils: fastify.utilsPlugin,
  });

  const alignment = resolvePaAlignment(params.paAction, computed.signal, vetoMode);
  const lotSize = resolveLotSize(symbol);
  const estRiskPerLot = estimateRiskPerLot(
    computed.optionPremium,
    lotSize,
    computed.optionDelta,
  );

  const componentRows = Object.entries(computed.explanations).map(
    ([id, exp]) => ({
      id,
      name: exp.name,
      score: exp.score ?? 0,
      interpretation: exp.interpretation,
      weightage: exp.weightage,
      humanExplanation: exp.meaning,
    }),
  );

  const payload: OptionChainSignalResponse = {
    fetchedAt: new Date().toISOString(),
    cached: false,
    symbol,
    tradingStyle,
    score: computed.score,
    signal: computed.signal,
    bias: computed.bias,
    ivRegime: computed.ivRegime,
    conviction: computed.conviction,
    confidence: computed.confidence,
    components: computed.components,
    componentRows,
    guard: {
      spotLtp: spot.ltp,
      atmStrike: computed.atmStrike,
      maxPain: computed.maxPain,
      pcr: computed.pcr,
      callOiTotal: computed.callOiTotal,
      putOiTotal: computed.putOiTotal,
      supportStrike: sr?.overallSupport ?? null,
      resistanceStrike: sr?.overallResistance ?? null,
      intradaySupport: sr?.intradaySupport ?? null,
      intradayResistance: sr?.intradayResistance ?? null,
      indiaVix: chainRes.data.indiavixData?.ltp ?? 0,
      levels: computed.guardLevels,
    },
    atmGreeks: computed.atmGreeks,
    paAlignment: alignment.alignment,
    paAlignmentDetail: alignment.detail,
    moneyness: params.moneyness,
    optionSide: params.moneyness ? params.optionSide : undefined,
    estRiskPerLot,
    optionPremium: computed.optionPremium,
    optionStrike: computed.optionStrike,
    optionDelta: computed.optionDelta,
    optionGamma: computed.optionGamma,
    optionTheta: computed.optionTheta,
    optionVega: computed.optionVega,
  };

  setCachedOptionChain(cacheKey, payload, cacheTtlMs);
  return payload;
}
