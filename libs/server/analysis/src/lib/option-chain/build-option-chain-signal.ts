import type { FastifyInstance } from 'fastify';
import { FyersAPI } from 'fyers-api-v3';
import {
  FYERS_OPTION_INDEX_SYMBOLS,
  GreeksMoneyness,
  OptionChainSignalResponse,
  OPTION_CHAIN_CACHE_TTL_MS,
  TradingStyle,
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

export interface BuildOptionChainSignalFromChainParams {
  symbol: string;
  tradingStyle: TradingStyle;
  paAction?: string;
  moneyness?: GreeksMoneyness;
  optionSide?: 'CE' | 'PE';
  chain: FyersAPI.OptionChainData[];
  spotLtp: number;
  spotLtpChangePercent: number;
  indiaVix: number;
  supportResistance?: {
    overallSupport: number | null;
    overallResistance: number | null;
    intradaySupport: number | null;
    intradayResistance: number | null;
  };
}

function resolveLotSize(symbol: string): number {
  const meta = FYERS_OPTION_INDEX_SYMBOLS.find((r) => r.symbol === symbol);
  return meta?.lotSize ?? 65;
}

function resolveVetoMode(fastify: FastifyInstance): string {
  const prefs = (
    fastify as FastifyInstance & {
      preferences?: {
        getSettings: () => { vetoMode: string };
      };
    }
  ).preferences;
  const settings = prefs?.getSettings?.() ?? { vetoMode: 'strict' };
  return normalizeVetoMode(settings.vetoMode, 'strict');
}

export async function buildOptionChainSignalResponse(
  fastify: FastifyInstance,
  params: BuildOptionChainSignalParams,
): Promise<OptionChainSignalResponse> {
  const symbol = params.symbol.trim();
  const tradingStyle = params.tradingStyle;
  const vetoMode = resolveVetoMode(fastify);
  const cacheTtlMs = OPTION_CHAIN_CACHE_TTL_MS;

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

  const payload = buildOptionChainSignalResponseFromChain(
    fastify,
    {
      symbol,
      tradingStyle,
      paAction: params.paAction,
      moneyness: params.moneyness,
      optionSide: params.optionSide,
      chain: chainRes.data.optionsChain,
      spotLtp: spot.ltp,
      spotLtpChangePercent: spot.changePercent,
      indiaVix: chainRes.data.indiavixData?.ltp ?? 0,
      supportResistance: fastify.supportResistancePlugin?.getSupportResistance(
        chainRes.data.optionsChain,
      ),
    },
  );

  setCachedOptionChain(cacheKey, payload, cacheTtlMs);
  return payload;
}

export function buildOptionChainSignalResponseFromChain(
  fastify: FastifyInstance,
  params: BuildOptionChainSignalFromChainParams,
): OptionChainSignalResponse {
  const computed = computeOptionMetricsFromChain({
    chain: params.chain,
    spotLtp: params.spotLtp,
    spotLtpChangePercent: params.spotLtpChangePercent,
    indiaVix: params.indiaVix,
    tradingStyle: params.tradingStyle,
    supportResistance: params.supportResistance,
    moneyness: params.moneyness,
    optionSide: params.moneyness ? params.optionSide : undefined,
    utils: fastify.utilsPlugin,
  });

  const alignment = resolvePaAlignment(
    params.paAction,
    computed.signal,
    normalizeVetoMode(
      (
        fastify as FastifyInstance & {
          preferences?: {
            getSettings: () => { vetoMode: string };
          };
        }
      ).preferences?.getSettings().vetoMode ?? 'strict',
      'strict',
    ),
  );
  const lotSize = resolveLotSize(params.symbol);
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

  return {
    fetchedAt: new Date().toISOString(),
    cached: false,
    symbol: params.symbol,
    tradingStyle: params.tradingStyle,
    score: computed.score,
    signal: computed.signal,
    bias: computed.bias,
    ivRegime: computed.ivRegime,
    conviction: computed.conviction,
    confidence: computed.confidence,
    components: computed.components,
    componentRows,
    guard: {
      spotLtp: params.spotLtp,
      atmStrike: computed.atmStrike,
      maxPain: computed.maxPain,
      pcr: computed.pcr,
      callOiTotal: computed.callOiTotal,
      putOiTotal: computed.putOiTotal,
      supportStrike: params.supportResistance?.overallSupport ?? null,
      resistanceStrike: params.supportResistance?.overallResistance ?? null,
      intradaySupport: params.supportResistance?.intradaySupport ?? null,
      intradayResistance: params.supportResistance?.intradayResistance ?? null,
      indiaVix: params.indiaVix,
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
}
