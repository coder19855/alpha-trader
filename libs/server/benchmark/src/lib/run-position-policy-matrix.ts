import { FastifyInstance } from 'fastify';
import {
  BenchmarkPositionPolicy,
  describePositionPolicy,
  parsePositionMatrixToken,
} from '@alpha-trader/server-position';
import { runBenchmark } from './run-benchmark.js';
import {
  BenchmarkMatrixComparison,
  BenchmarkParams,
  BenchmarkReport,
} from './types.js';

const POSITION_POLICY_LABELS: Record<BenchmarkPositionPolicy, string> = {
  flat: 'Flat (full size)',
  'scale-ladder': 'Scale-out ladder (33/33/34)',
  'runner-heavy': 'Runner-heavy ladder (25/25/50)',
};

export async function runPositionPolicyMatrix(
  fastify: FastifyInstance,
  input: BenchmarkParams & { positionMatrix: BenchmarkPositionPolicy[] },
): Promise<BenchmarkReport> {
  const variantIds = input.positionMatrix;
  const variants: BenchmarkMatrixComparison['variants'] = [];
  const reportsById = new Map<BenchmarkPositionPolicy, BenchmarkReport>();

  for (let i = 0; i < variantIds.length; i += 1) {
    const positionPolicy = variantIds[i];
    const label = POSITION_POLICY_LABELS[positionPolicy];
    const report = await runBenchmark(fastify, {
      ...input,
      positionMatrix: undefined,
      positionPolicy,
      onProgress: input.onProgress
        ? async (progress) => {
            await input.onProgress?.({
              ...progress,
              message: `[${i + 1}/${variantIds.length}] ${label} — ${progress.message ?? ''}`,
            });
          }
        : undefined,
    });

    const summary = report.aiComparison.baseline;
    reportsById.set(positionPolicy, report);
    variants.push({
      profileId: positionPolicy,
      label,
      gates: [describePositionPolicy(positionPolicy)],
      summary,
      filterStats: report.filterStats ?? {
        anchorsScanned: 0,
        rawDirectional: 0,
        tradeCandidates: 0,
        chaseBlocked: 0,
        chaseDecayFiltered: 0,
        convictionFiltered: 0,
        noSetup: 0,
        sessionDayBlocked: 0,
        maxTradesBlocked: 0,
        cooldownBlocked: 0,
        noTradeWindowBlocked: 0,
        tradesTaken: 0,
      },
      totalPnlR: summary.totalPnlR,
    });
  }

  const sorted = [...variants].sort((a, b) => b.totalPnlR - a.totalPnlR);
  const winner = sorted[0];
  const winnerReport =
    reportsById.get(winner.profileId as BenchmarkPositionPolicy) ??
    reportsById.values().next().value!;

  const baseline =
    variants.find((v) => v.profileId === 'flat') ?? sorted[sorted.length - 1];
  const deltaR = +(winner.totalPnlR - baseline.totalPnlR).toFixed(2);

  const matrixComparison: BenchmarkMatrixComparison = {
    winnerId: winner.profileId,
    winnerLabel: winner.label,
    baselineId: baseline.profileId,
    baselineLabel: baseline.label,
    variants: sorted,
    insights: [
      `Winner: ${winner.label} (${winner.totalPnlR}R total).`,
      deltaR >= 0
        ? `+${deltaR}R vs ${baseline.label}.`
        : `${deltaR}R vs ${baseline.label}.`,
    ],
    notes: [
      `Compared ${variantIds.length} position policies on identical entries.`,
    ],
  };

  return {
    ...winnerReport,
    matrixComparison,
    simulationNote: `${winnerReport.simulationNote} Position matrix: ${matrixComparison.notes[0]}`,
  };
}

export { parsePositionMatrixToken };