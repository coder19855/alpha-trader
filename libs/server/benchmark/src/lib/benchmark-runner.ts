import { FastifyInstance } from 'fastify';
import { runBenchmark as runBenchmarkReplay } from './run-benchmark.js';
import { createBenchmarkReportId } from './benchmark-job-store.js';
import { BenchmarkParams, BenchmarkReport } from './types.js';

export async function runBenchmark(
  fastify: FastifyInstance,
  params: BenchmarkParams,
  onProgress?: (percent: number, message: string) => Promise<void>,
): Promise<BenchmarkReport> {
  const report = await runBenchmarkReplay(fastify, {
    ...params,
    flowMode: params.flowMode ?? 'pa-only',
    aiMode: params.aiMode ?? 'off',
    onProgress: onProgress
      ? (progress) => onProgress(progress.percent, progress.message)
      : params.onProgress,
  });

  return {
    ...report,
    reportId: createBenchmarkReportId(),
  };
}