import '../augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { HttpStatusCode } from 'axios';
import { FyersAPI } from 'fyers-api-v3';
import { parseVetoModeQuery } from '@alpha-trader/server-shared';
import { computeLivePriceAction } from '../live-price-action.js';

export default async function technicalAnalysisRoute(fastify: FastifyInstance) {
  fastify.get('/api/technical-analysis', async (request, reply) => {
    try {
      const {
        symbol,
        range_to,
        tradingStyle: styleQuery,
        vetoOff: vetoOffQuery,
        vetoMode: vetoModeQuery,
        skipVeto: skipVetoQuery,
      } = request.query as FyersAPI.HistoryQueryRequest & {
        tradingStyle?: string;
        vetoOff?: string;
        vetoMode?: string;
        skipVeto?: string;
      };

      const entryVetoMode = parseVetoModeQuery(
        vetoModeQuery,
        vetoOffQuery ?? skipVetoQuery,
      );

      let rangeTo = +range_to || Date.now();
      if (rangeTo < 10_000_000_000) rangeTo *= 1000;

      const snapshot = await computeLivePriceAction(fastify, {
        symbol: String(symbol),
        tradingStyle: styleQuery,
        vetoMode: entryVetoMode,
        rangeToMs: rangeTo,
      });

      if (!snapshot) {
        return reply.code(HttpStatusCode.BadRequest).send({
          error: 'Price action unavailable',
        });
      }

      reply.send(snapshot);
    } catch (error) {
      reply.status(HttpStatusCode.InternalServerError).send({ error });
    }
  });
}