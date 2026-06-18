import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createOpenPositionsStreamSubscriber } from '@alpha-trader/server-stream';
import { isIndianMarketOpen } from '@alpha-trader/server-shared';

function writeSse(reply: FastifyReply, payload: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export default async function openPositionsStreamRoutes(
  fastify: FastifyInstance,
) {
  fastify.get('/api/open-positions/stream', async (request, reply) => {
    const { symbol, tradingStyle } = request.query as {
      symbol?: string;
      tradingStyle?: string;
    };

    if (!symbol?.trim()) {
      return reply.code(400).send({ error: 'symbol is required' });
    }

    const sessionReady = await fastify.ensureFyersSession();
    if (!sessionReady) {
      return reply.code(503).send({
        error: 'Fyers session expired — log in again.',
      });
    }

    handleOpenPositionsStream(fastify, request, reply, {
      symbol: symbol.trim(),
      tradingStyle,
    });
  });
}

function handleOpenPositionsStream(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  params: { symbol: string; tradingStyle?: string },
): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  request.raw.on('close', () => {
    closed = true;
    unsubscribe?.();
  });

  writeSse(reply, {
    type: 'status',
    message: 'Connected',
    phase: 'connecting',
  });

  if (!isIndianMarketOpen()) {
    writeSse(reply, {
      type: 'status',
      message: 'Market closed — live ticks paused',
      phase: 'closed',
    });
  }

  const subscriber = createOpenPositionsStreamSubscriber(reply, () => closed);
  const unsubscribe = fastify.openPositionsStreamHub.subscribe(
    params,
    subscriber,
  );
}