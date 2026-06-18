import { FastifyInstance } from 'fastify';
import {
  FYERS_OPTION_INDEX_SYMBOLS,
  TradingStyle,
} from '@alpha-trader/server-shared';
import {
  computeManagementAdvice,
  fetchOpenIndexOptionPositions,
  buildOpenPositionContextFromPositions,
  toManagementDecisionPayload,
} from '@alpha-trader/server-position';
import {
  computePaDecision,
  computePriceAction,
} from '@alpha-trader/server-analysis';

function parseTradingStyle(raw?: string): TradingStyle {
  const style = String(raw || TradingStyle.Intraday).toUpperCase();
  if (style === TradingStyle.Scalper) return TradingStyle.Scalper;
  if (style === TradingStyle.Positional) return TradingStyle.Positional;
  return TradingStyle.Intraday;
}

export default async function openPositionsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/open-positions', async (request, reply) => {
    const { indexSymbol, tradingStyle } = request.query as {
      indexSymbol?: string;
      tradingStyle?: string;
    };

    const sessionReady = await fastify.ensureFyersSession({ verifyWithApi: true });
    if (!sessionReady) {
      return reply.code(503).send({
        error: 'Fyers session expired — log in again.',
      });
    }

    const allIndexSymbols = FYERS_OPTION_INDEX_SYMBOLS.map((row) => row.symbol);
    const positions = await fetchOpenIndexOptionPositions(
      fastify,
      allIndexSymbols,
    );

    const filtered = indexSymbol?.trim()
      ? positions.filter((p) => p.indexSymbol === indexSymbol.trim())
      : positions;

    const style = parseTradingStyle(tradingStyle);
    const positionContext = buildOpenPositionContextFromPositions(filtered);

    let management = null;
    const primaryIndex =
      indexSymbol?.trim() ?? filtered[0]?.indexSymbol ?? allIndexSymbols[0];

    if (primaryIndex) {
      const priceData = await computePriceAction(fastify, {
        symbol: primaryIndex,
        tradingStyle: style,
      });
      if (priceData) {
        const paDecision = computePaDecision(fastify, priceData, style);
        const decision = toManagementDecisionPayload({
          action: paDecision.action,
          conviction: paDecision.conviction,
          overallSignal: priceData.signal,
        });
        management = computeManagementAdvice(
          positionContext,
          decision,
          priceData,
          style,
        );
      }
    }

    return {
      asOf: new Date().toISOString(),
      positions: filtered,
      positionContext: {
        count: positionContext.count,
        heldDirection: positionContext.heldDirection,
        isMixedDirections: positionContext.isMixedDirections,
        fetchSucceeded: positionContext.fetchSucceeded,
      },
      management,
      ws: fastify.fyersOrderStream?.getStats(),
      quotes: fastify.fyersMarketStream?.getStats(),
    };
  });
}