import { FastifyInstance } from 'fastify';
import { runBenchmark } from './run-benchmark.js';
import {
  BENCHMARK_MATRIX_PRESETS,
  resolveSignalProfile,
  describeProfileGates,
} from './signal-profile.js';
import {
  BenchmarkMatrixComparison,
  BenchmarkParams,
  BenchmarkReport,
} from './types.js';

export async function runBenchmarkMatrix(
  fastify: FastifyInstance,
  input: BenchmarkParams & { signalMatrix: string[] },
): Promise<BenchmarkReport> {
  const variantIds = input.signalMatrix.length
    ? input.signalMatrix
    : [...BENCHMARK_MATRIX_PRESETS];

  const variants: BenchmarkMatrixComparison['variants'] = [];
  const reportsById = new Map<string, BenchmarkReport>();

  for (let i = 0; i < variantIds.length; i += 1) {
    const profileId = variantIds[i];
    const isEngine = !profileId || profileId === 'engine';
    const profile = isEngine ? resolveSignalProfile('engine') : resolveSignalProfile(profileId);
    const label = isEngine ? 'Default engine (PA gates)' : profile.label;
    const gates = describeProfileGates(profile);

    const report = await runBenchmark(fastify, {
      ...input,
      signalMatrix: undefined,
      signalProfile: isEngine ? undefined : profileId,
      onProgress: input.onProgress
        ? async (progress) => {
            await input.onProgress?.({
              ...progress,
              message: `[${i + 1}/${variantIds.length}] ${label} — ${progress.message ?? ''}`,
            });
          }
        : undefined,
    });

    const summary = report.aiComparison?.baseline;
    reportsById.set(profileId, report);
    variants.push({
      profileId,
      label,
      gates,
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
      totalPnlR: summary?.totalPnlR ?? 0,
    });
  }

  const sorted = [...variants].sort((a, b) => b.totalPnlR - a.totalPnlR);
  const winner = sorted[0];
  const winnerReport = reportsById.get(winner.profileId) ?? reportsById.values().next().value!;

  const baseline =
    variants.find((v) => v.profileId === 'engine' || v.profileId === 'breakout-vol') ?? sorted[sorted.length - 1];

  const rankedVariants = sorted.map((variant, index) => ({
    ...variant,
    rank: index + 1,
    deltaVsBaselineR: baseline
      ? +(variant.totalPnlR - (baseline.totalPnlR ?? 0)).toFixed(3)
      : undefined,
  }));

  const insights: string[] = [];
  if (sorted.length >= 2) {
    const gap = +(sorted[0].totalPnlR - sorted[1].totalPnlR).toFixed(2);
    insights.push(`${sorted[0].label} leads by ${gap}R vs ${sorted[1].label}.`);
  }

  const matrixComparison: BenchmarkMatrixComparison = {
    variants: rankedVariants,
    winnerId: winner.profileId,
    winnerLabel: winner.label,
    baselineId: baseline?.profileId,
    baselineLabel: baseline?.label,
    insights,
    notes: [
      `Signal entry matrix — compared ${variants.length} entry rule sets.`,
      'Winner (total R) shown in trade log below; full comparison in matrix panel.',
      `Sequential replays for each combo (~${variants.length * 1}–${variants.length * 3} min).`,
    ],
  };

  return {
    ...winnerReport,
    matrixComparison,
    simulationNote: `${winnerReport.simulationNote ?? ''} Signal matrix: ${matrixComparison.notes[0]}`.trim(),
  };
}