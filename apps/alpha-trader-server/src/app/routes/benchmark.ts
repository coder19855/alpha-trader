import { FastifyInstance } from 'fastify';
import {
  benchmarkExcelFilename,
  buildBenchmarkExcelBuffer,
  buildBenchmarkOptionsResponse,
  type BenchmarkOptionsResponse,
  countBenchmarkReplays,
  createBenchmarkJobFromWebConfig,
  enqueueBenchmarkJob,
  estimateBenchmarkJobMaxMs,
  loadBenchmarkJob,
  loadBenchmarkReport,
  normalizeWebConfigInput,
  resolveBenchmarkWebConfigDefaults,
  serializeBenchmarkJobStatus,
  type BenchmarkReport,
} from '@alpha-trader/server-benchmark';
import { TradingStyle } from '@alpha-trader/server-shared';

export default async function benchmarkRoutes(fastify: FastifyInstance) {
  fastify.get('/api/benchmark/options', async (request) => {
    const query = request.query as { symbol?: string; style?: string };
    const symbol = query.symbol?.trim() || 'NSE:NIFTY50-INDEX';
    const style =
      (query.style?.toUpperCase() as TradingStyle) || TradingStyle.Intraday;
    return buildBenchmarkOptionsResponse(fastify, { symbol, style });
  });

  fastify.post('/api/benchmark/start', async (request, reply) => {
    const sessionReady = await fastify.ensureFyersSession();
    if (!sessionReady) {
      return reply.code(503).send({
        error: 'Fyers session expired — log in again.',
      });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const symbol =
      typeof body.symbol === 'string' ? body.symbol : 'NSE:NIFTY50-INDEX';
    const tradingStyle =
      typeof body.tradingStyle === 'string'
        ? (body.tradingStyle.toUpperCase() as TradingStyle)
        : TradingStyle.Intraday;
    const fallback = resolveBenchmarkWebConfigDefaults(
      fastify,
      symbol,
      tradingStyle,
    );

    try {
      const config = normalizeWebConfigInput(body, fallback);
      const replays = countBenchmarkReplays(config);
      const options: BenchmarkOptionsResponse = buildBenchmarkOptionsResponse(
        fastify,
        {
          symbol: config.symbol,
          style: config.tradingStyle,
        },
      );
      const limits = options.limits;

      if (
        replays > limits.maxReplaysWithoutConfirm &&
        body.confirmLargeRun !== true
      ) {
        return reply.code(400).send({
          error: 'Large matrix run requires confirmation',
          replays,
          maxWithoutConfirm: limits.maxReplaysWithoutConfirm,
        });
      }

      const jobMaxMs = estimateBenchmarkJobMaxMs(config);
      const { jobId } = await createBenchmarkJobFromWebConfig(fastify, config);
      enqueueBenchmarkJob(fastify, jobId);
      return { jobId, replays, jobMaxMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: message });
    }
  });

  fastify.get('/api/benchmark/status', async (request, reply) => {
    const { jobId } = request.query as { jobId?: string };
    if (!jobId?.trim()) {
      return reply.code(400).send({ error: 'jobId is required' });
    }

    const job = await loadBenchmarkJob(fastify, jobId.trim());
    if (!job) {
      return reply
        .code(404)
        .send({ error: 'Job not found or expired — run benchmark again.' });
    }

    return serializeBenchmarkJobStatus(job);
  });

  fastify.get('/api/benchmark/report', async (request, reply) => {
    const { reportId } = request.query as { reportId?: string };
    if (!reportId?.trim()) {
      return reply.code(400).send({ error: 'reportId is required' });
    }

    const report = await loadBenchmarkReport(fastify, reportId.trim());
    if (!report) {
      return reply
        .code(404)
        .send({ error: 'Report not found or expired — run benchmark again.' });
    }

    return { ...(report as object), reportId: reportId.trim() };
  });

  fastify.get('/api/benchmark/export', async (request, reply) => {
    const { reportId } = request.query as { reportId?: string };
    if (!reportId?.trim()) {
      return reply.code(400).send({ error: 'reportId is required' });
    }

    const report = await loadBenchmarkReport(fastify, reportId.trim());
    if (!report) {
      return reply
        .code(404)
        .send({ error: 'Report not found or expired — run benchmark again.' });
    }

    const buffer = buildBenchmarkExcelBuffer(report as BenchmarkReport);
    const filename = benchmarkExcelFilename(report as BenchmarkReport);

    return reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  });
}