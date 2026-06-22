import '../augment-fastify.js';
import { FastifyInstance } from 'fastify';

import { HttpStatusCode } from 'axios';
import { FyersAPI } from 'fyers-api-v3';
import {
  FYERS_OPTION_INDEX_SYMBOLS,
  GreeksMoneyness,
  normalizeOptionChainPollMs,
  normalizeVetoMode,
  OptionChainSignalResponse,
  OPTION_CHAIN_POLL_DEFAULT_MS,
  ResponseStatus,
  toErrorMessage,
  TradingStyle,
} from '@alpha-trader/server-shared';
import { fyersErrorMessage, isFyersAuthError } from '../option-chain/fyers-error.js';
import { resolveSpotLtp } from '../option-chain/resolve-spot-ltp.js';
import {
  computeOptionMetricsFromChain,
  estimateRiskPerLot,
  resolvePaAlignment,
} from '../option-chain/compute-option-metrics.js';
import {
  getCachedOptionChain,
  optionChainCacheKey,
  setCachedOptionChain,
} from '../option-chain/option-chain-cache.js';

function normalizeTradingStyle(value: unknown): TradingStyle {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'SCALPER' || raw === TradingStyle.Scalper) return TradingStyle.Scalper;
  if (raw === 'POSITIONAL' || raw === TradingStyle.Positional) {
    return TradingStyle.Positional;
  }
  return TradingStyle.Intraday;
}

function normalizeMoneyness(value: unknown): GreeksMoneyness | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'ATM' || raw === 'ITM' || raw === 'OTM') return raw;
  return undefined;
}

function normalizeOptionSide(value: unknown): 'CE' | 'PE' {
  const raw = String(value ?? '').trim().toUpperCase();
  return raw === 'PE' ? 'PE' : 'CE';
}

function resolveLotSize(symbol: string): number {
  const meta = FYERS_OPTION_INDEX_SYMBOLS.find((r) => r.symbol === symbol);
  return meta?.lotSize ?? 65;
}

export default async function optionChainRoute(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get<{
    Querystring: {
      symbol?: string;
      style?: string;
      refresh?: string;
      moneyness?: string;
      side?: string;
      paAction?: string;
    };
  }>('/api/option-chain', async (request, reply) => {
    const symbol = String(request.query.symbol ?? 'NSE:NIFTY50-INDEX').trim();
    const tradingStyle = normalizeTradingStyle(request.query.style);
    const moneyness = normalizeMoneyness(request.query.moneyness);
    const optionSide = normalizeOptionSide(request.query.side);
    const paAction = request.query.paAction?.trim();
    const forceRefresh =
      request.query.refresh === 'true' || request.query.refresh === '1';
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
    const vetoMode = normalizeVetoMode(settings.vetoMode, 'strict');
    const pollMs = normalizeOptionChainPollMs(settings.optionChainPollMs);
    const cacheTtlMs = pollMs > 0 ? pollMs : 60_000;

    const cacheKey = optionChainCacheKey(
      symbol,
      tradingStyle,
      moneyness,
      optionSide,
    );
    if (!forceRefresh) {
      const cached = getCachedOptionChain(cacheKey);
      if (cached) {
        const alignment = resolvePaAlignment(paAction, cached.signal, vetoMode);
        return reply.send({
          ...cached,
          paAlignment: alignment.alignment,
          paAlignmentDetail: alignment.detail,
        });
      }
    }

    try {
      const sessionReady = await (
        fastify as FastifyInstance & {
          ensureFyersSession?: (opts?: { verifyWithApi?: boolean }) => Promise<boolean>;
        }
      ).ensureFyersSession?.();
      if (sessionReady === false) {
        return reply.status(HttpStatusCode.Unauthorized).send({
          s: ResponseStatus.error,
          error:
            'Fyers is not connected. Log in via Connect Fyers, then refresh option chain.',
        });
      }

      const spot = await resolveSpotLtp(fastify, symbol);
      if (!spot) {
        return reply.status(HttpStatusCode.BadGateway).send({
          s: ResponseStatus.error,
          error:
            'Unable to resolve spot LTP. Check Fyers connection and that the symbol is valid.',
        });
      }
      const spotLtp = spot.ltp;
      const spotChange = spot.changePercent;

      let chainRes: FyersAPI.OptionChainResponse;
      try {
        chainRes = await fastify.fyers.getOptionChain({
          symbol,
          strikecount: 12,
          timestamp: '',
          greeks: 1,
        } as FyersAPI.OptionChainRequest);
      } catch (chainErr: unknown) {
        const status = isFyersAuthError(chainErr)
          ? HttpStatusCode.Unauthorized
          : HttpStatusCode.BadGateway;
        return reply.status(status).send({
          s: ResponseStatus.error,
          error: fyersErrorMessage(chainErr),
        });
      }

      if (chainRes.s !== 'ok' || !chainRes.data?.optionsChain?.length) {
        return reply.status(HttpStatusCode.BadGateway).send({
          s: ResponseStatus.error,
          error: toErrorMessage(chainRes) || 'Option chain unavailable from Fyers',
        });
      }

      const sr = fastify.supportResistancePlugin?.getSupportResistance(
        chainRes.data.optionsChain,
      );

      const computed = computeOptionMetricsFromChain({
        chain: chainRes.data.optionsChain,
        spotLtp,
        spotLtpChangePercent: spotChange,
        indiaVix: chainRes.data.indiavixData?.ltp ?? 0,
        tradingStyle,
        supportResistance: sr,
        moneyness,
        optionSide: moneyness ? optionSide : undefined,
        utils: fastify.utilsPlugin,
      });

      const alignment = resolvePaAlignment(
        paAction,
        computed.signal,
        vetoMode,
      );

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
          spotLtp,
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
        moneyness,
        optionSide: moneyness ? optionSide : undefined,
        estRiskPerLot,
        optionPremium: computed.optionPremium,
        optionStrike: computed.optionStrike,
        optionDelta: computed.optionDelta,
        optionGamma: computed.optionGamma,
        optionTheta: computed.optionTheta,
        optionVega: computed.optionVega,
      };

      setCachedOptionChain(cacheKey, payload, cacheTtlMs);
      return reply.send(payload);
    } catch (err: unknown) {
      const message = fyersErrorMessage(err);
      request.log.error({ err, symbol, message }, 'option-chain fetch failed');
      const status = isFyersAuthError(err)
        ? HttpStatusCode.Unauthorized
        : HttpStatusCode.InternalServerError;
      return reply.status(status).send({
        s: ResponseStatus.error,
        error: message,
      });
    }
  });
}