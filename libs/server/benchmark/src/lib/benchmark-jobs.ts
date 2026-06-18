import { FastifyInstance } from 'fastify';
import {
  createBenchmarkJobId,
  createBenchmarkReportId,
  patchBenchmarkJob,
  saveBenchmarkJob,
  saveBenchmarkReport,
} from './benchmark-job-store.js';
import { runBenchmark } from './benchmark-runner.js';
import { BenchmarkParams } from './types.js';
import { estimateBenchmarkJobMaxMs, normalizeWebConfigInput } from './benchmark-options.js';
import { clampBenchmarkDays } from './benchmark-window.js';

const queue: string[] = [];
let running = false;

export async function createBenchmarkJobFromWebConfig(
  fastify: FastifyInstance,
  config: BenchmarkParams,
): Promise<{ jobId: string }> {
  const defaults = {
    symbol: config.symbol,
    tradingStyle: config.tradingStyle,
    days: clampBenchmarkDays(config.days ?? 14),
    aiMode: config.aiMode ?? 'off',
    vetoMode: config.vetoMode,
    pnlModel: config.pnlModel ?? 'index',
    flowMode: config.flowMode ?? 'pa-only',
  } satisfies BenchmarkParams;
  const params = normalizeWebConfigInput(
    config as unknown as Record<string, unknown>,
    defaults,
  );
  const days = clampBenchmarkDays(params.days ?? 14);
  const jobParams = { ...params, days };

  const jobId = createBenchmarkJobId();
  const now = new Date().toISOString();
  const jobMaxMs = estimateBenchmarkJobMaxMs(jobParams);

  await saveBenchmarkJob(fastify, {
    jobId,
    status: 'queued',
    progress: {
      phase: 'queued',
      percent: 0,
      message: 'Queued',
      totalDays: days,
    },
    params: jobParams,
    jobMaxMs,
    createdAt: now,
    updatedAt: now,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  });

  return { jobId };
}

export function enqueueBenchmarkJob(
  fastify: FastifyInstance,
  jobId: string,
): void {
  queue.push(jobId);
  void drainQueue(fastify);
}

async function drainQueue(fastify: FastifyInstance): Promise<void> {
  if (running) return;
  running = true;

  while (queue.length) {
    const jobId = queue.shift();
    if (!jobId) continue;
    await executeBenchmarkJob(fastify, jobId);
  }

  running = false;
}

async function executeBenchmarkJob(
  fastify: FastifyInstance,
  jobId: string,
): Promise<void> {
  const job = await patchBenchmarkJob(fastify, jobId, {
    status: 'running',
    runStartedAtMs: Date.now(),
    progress: {
      phase: 'fetching',
      percent: 2,
      message: 'Starting benchmark…',
    },
  });
  if (!job) return;

  try {
    const report = await runBenchmark(fastify, job.params, async (percent, message) => {
      void patchBenchmarkJob(fastify, jobId, {
        progress: {
          phase: percent >= 80 ? 'finalizing' : percent >= 42 ? 'simulating' : 'fetching',
          percent,
          message,
          totalDays: job.params.days,
          elapsedMs: Date.now() - (job.runStartedAtMs ?? Date.now()),
        },
      }).catch((err) => {
        fastify.log.warn({ err, jobId }, 'benchmark progress patch failed');
      });
    });

    const reportId = report.reportId ?? createBenchmarkReportId();
    await saveBenchmarkReport(fastify, reportId, report);
    await patchBenchmarkJob(fastify, jobId, {
      status: 'complete',
      reportId,
      progress: {
        phase: 'complete',
        percent: 100,
        message: 'Complete',
        totalDays: job.params.days,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fastify.log.warn({ err, jobId }, 'benchmark job failed');
    await patchBenchmarkJob(fastify, jobId, {
      status: 'failed',
      error: message,
      progress: {
        phase: 'failed',
        percent: 100,
        message,
      },
    });
  }
}