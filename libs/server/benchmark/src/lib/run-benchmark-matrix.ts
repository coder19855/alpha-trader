import { FastifyInstance } from 'fastify';
import type { BenchmarkParams, BenchmarkReport } from './types.js';

export async function runBenchmarkMatrix(
  _fastify: FastifyInstance,
  _input: BenchmarkParams & { signalMatrix: string[] },
): Promise<BenchmarkReport> {
  throw new Error('Signal matrix not yet supported in alpha-trader');
}