import './augment-fastify.js';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { BenchmarkJobProgress, BenchmarkJobRecord } from './types.js';

const COLLECTION = 'benchmark-jobs';
const REPORT_COLLECTION = 'benchmark-reports';
export const BENCHMARK_JOB_TTL_MS = 6 * 60 * 60 * 1000;

const memoryJobs = new Map<string, BenchmarkJobRecord>();
const memoryReports = new Map<string, { reportId: string; payload: unknown; expiresAt: number }>();

export function createBenchmarkJobId(): string {
  return crypto.randomBytes(12).toString('hex');
}

export function createBenchmarkReportId(): string {
  return crypto.randomBytes(10).toString('hex');
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [id, job] of memoryJobs.entries()) {
    if (job.expiresAt <= now) memoryJobs.delete(id);
  }
  for (const [id, report] of memoryReports.entries()) {
    if (report.expiresAt <= now) memoryReports.delete(id);
  }
}

export async function saveBenchmarkJob(
  fastify: FastifyInstance,
  job: BenchmarkJobRecord,
): Promise<void> {
  purgeExpired();
  memoryJobs.set(job.jobId, job);
  const col = fastify.mongo?.db?.collection(COLLECTION);
  if (col) {
    await col.updateOne({ jobId: job.jobId }, { $set: job }, { upsert: true });
  }
}

export async function loadBenchmarkJob(
  fastify: FastifyInstance,
  jobId: string,
): Promise<BenchmarkJobRecord | null> {
  purgeExpired();
  const trimmed = jobId.trim();
  if (!trimmed) return null;

  const cached = memoryJobs.get(trimmed);
  if (cached) {
    if (cached.expiresAt <= Date.now()) {
      memoryJobs.delete(trimmed);
      return null;
    }
    return cached;
  }

  const col = fastify.mongo?.db?.collection<BenchmarkJobRecord>(COLLECTION);
  if (!col) return null;
  const doc = await col.findOne({ jobId: trimmed });
  if (!doc || doc.expiresAt <= Date.now()) return null;
  memoryJobs.set(trimmed, doc);
  return doc;
}

export async function patchBenchmarkJob(
  fastify: FastifyInstance,
  jobId: string,
  patch: Partial<BenchmarkJobRecord> & { progress?: BenchmarkJobProgress },
): Promise<BenchmarkJobRecord | null> {
  const job = await loadBenchmarkJob(fastify, jobId);
  if (!job) return null;
  const updated: BenchmarkJobRecord = {
    ...job,
    ...patch,
    progress: patch.progress ?? job.progress,
    updatedAt: new Date().toISOString(),
  };
  await saveBenchmarkJob(fastify, updated);
  return updated;
}

export async function saveBenchmarkReport(
  fastify: FastifyInstance,
  reportId: string,
  payload: unknown,
): Promise<void> {
  purgeExpired();
  const expiresAt = Date.now() + BENCHMARK_JOB_TTL_MS;
  memoryReports.set(reportId, { reportId, payload, expiresAt });
  const col = fastify.mongo?.db?.collection(REPORT_COLLECTION);
  if (col) {
    await col.updateOne(
      { reportId },
      { $set: { reportId, payload, expiresAt, updatedAt: new Date().toISOString() } },
      { upsert: true },
    );
  }
}

export async function loadBenchmarkReport(
  fastify: FastifyInstance,
  reportId: string,
): Promise<unknown | null> {
  purgeExpired();
  const trimmed = reportId.trim();
  if (!trimmed) return null;

  const cached = memoryReports.get(trimmed);
  if (cached) {
    if (cached.expiresAt <= Date.now()) {
      memoryReports.delete(trimmed);
      return null;
    }
    return cached.payload;
  }

  const col = fastify.mongo?.db?.collection<{ reportId: string; payload: unknown; expiresAt: number }>(
    REPORT_COLLECTION,
  );
  if (!col) return null;
  const doc = await col.findOne({ reportId: trimmed });
  if (!doc || doc.expiresAt <= Date.now()) return null;
  memoryReports.set(trimmed, {
    reportId: trimmed,
    payload: doc.payload,
    expiresAt: doc.expiresAt,
  });
  return doc.payload;
}

export function buildProgressUpdate(
  partial: Omit<BenchmarkJobProgress, 'percent'> & { percent?: number },
): BenchmarkJobProgress {
  return {
    phase: partial.phase,
    percent: Math.min(100, Math.max(0, Math.round(partial.percent ?? 0))),
    message: partial.message,
    currentDay: partial.currentDay,
    totalDays: partial.totalDays,
    anchorsDone: partial.anchorsDone,
    anchorsTotal: partial.anchorsTotal,
    elapsedMs: partial.elapsedMs,
  };
}

export function serializeBenchmarkJobStatus(job: BenchmarkJobRecord) {
  return {
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    reportId: job.reportId ?? null,
    error: job.error ?? null,
    params: {
      symbol: job.params.symbol,
      tradingStyle: job.params.tradingStyle,
      days: job.params.days,
      aiMode: job.params.aiMode ?? 'off',
      maxTradesPerDay: job.params.maxTradesPerDay ?? null,
      vetoMode: job.params.vetoMode ?? 'strict',
    },
    runStartedAtMs: job.runStartedAtMs ?? null,
    jobMaxMs: job.jobMaxMs ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}