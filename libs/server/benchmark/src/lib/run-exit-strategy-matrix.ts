import { FastifyInstance } from 'fastify';
import {
  BENCHMARK_EXIT_MATRIX_PRESETS,
  describeExitPolicy,
  BenchmarkExitPolicy,
} from '@alpha-trader/server-analysis';
import { runBenchmark } from './run-benchmark.js';
import {
  BenchmarkMatrixComparison,
  BenchmarkParams,
  BenchmarkReport,
} from './types.js';

const EXIT_POLICY_LABELS: Record<BenchmarkExitPolicy, string> = {
  'rr-ladder': 'R:R ladder (default)',
  'breakeven-lock': 'Break-even lock',
  'chandelier-hybrid': 'Hybrid (R:R + Chandelier)',
  'atr-tighten': 'ATR tighten (3×→2×)',
  'partial-scale-50': 'Partial 50% @ 1.5R',
  'structure-trail': 'Structure swing trail',
  'momentum-decay-exit': 'Momentum decay exit',
  chandelier: 'Chandelier ATR (pure)',
};

export async function runExitStrategyMatrix(
  fastify: FastifyInstance,
  input: BenchmarkParams & { exitMatrix: BenchmarkExitPolicy[] },
): Promise<BenchmarkReport> {
  const variantIds = input.exitMatrix.map((id) => id);
  const variants: BenchmarkMatrixComparison['variants'] = [];
  const reportsById = new Map<BenchmarkExitPolicy, BenchmarkReport>();

  for (let i = 0; i < variantIds.length; i += 1) {
    const exitPolicy = variantIds[i];
    const label = EXIT_POLICY_LABELS[exitPolicy];
    const report = await runBenchmark(fastify, {
      ...input,
      exitMatrix: undefined,
      exitPolicy,
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
    reportsById.set(exitPolicy, report);
    variants.push({
      profileId: exitPolicy,
      label,
      gates: [describeExitPolicy(exitPolicy)],
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
    reportsById.get(winner.profileId as BenchmarkExitPolicy) ??
    reportsById.values().next().value!;

  const baseline =
    variants.find((v) => v.profileId === 'rr-ladder') ?? sorted[sorted.length - 1];

  const rankedVariants = sorted.map((variant, index) => ({
    ...variant,
    rank: index + 1,
    deltaVsBaselineR: baseline
      ? +(variant.totalPnlR - baseline.totalPnlR).toFixed(3)
      : undefined,
  }));

  const ddSorted = [...variants].sort(
    (a, b) =>
      (reportsById.get(a.profileId as BenchmarkExitPolicy)?.capitalSummary
        .maxDrawdownR ?? 0) -
      (reportsById.get(b.profileId as BenchmarkExitPolicy)?.capitalSummary
        .maxDrawdownR ?? 0),
  );
  const lowestDd = ddSorted[0];

  const insights: string[] = [];
  if (sorted.length >= 2) {
    const gap = +(sorted[0].totalPnlR - sorted[1].totalPnlR).toFixed(2);
    insights.push(
      `${sorted[0].label} leads on total R by ${gap}R vs ${sorted[1].label}.`,
    );
  }
  if (baseline && winner.profileId !== baseline.profileId) {
    insights.push(
      `Exit winner beats R:R baseline by ${+(winner.totalPnlR - baseline.totalPnlR).toFixed(2)}R.`,
    );
  } else if (baseline) {
    insights.push('R:R ladder still leads on total R — ATR trail may be cutting runners early.');
  }
  if (lowestDd) {
    const ddReport = reportsById.get(lowestDd.profileId as BenchmarkExitPolicy);
    insights.push(
      `Lowest max drawdown: ${lowestDd.label} (${ddReport?.capitalSummary.maxDrawdownR ?? 0}R / ${ddReport?.capitalSummary.maxDrawdownPercent ?? 0}%).`,
    );
  }

  const matrixComparison: BenchmarkMatrixComparison = {
    variants: rankedVariants,
    winnerId: winner.profileId,
    winnerLabel: winner.label,
    baselineId: baseline?.profileId,
    baselineLabel: baseline?.label,
    insights,
    notes: [
      `Compared ${variants.length} exit strategies — winner on total R: ${winner.label} (${winner.totalPnlR}R).`,
      'Same signal entries and session rules; only trailing exit model differs.',
      `Exit matrix = ${variants.length} sequential replays (~${variants.length * 2}–${variants.length * 8} min on 30d).`,
      'Trade log below is the total-R winner — see matrix panel for all variants.',
    ],
  };

  return {
    ...winnerReport,
    matrixComparison,
    simulationNote: `${winnerReport.simulationNote} Exit matrix: ${matrixComparison.notes[0]}`,
  };
}

export function parseExitMatrixToken(token: string): BenchmarkExitPolicy[] | null {
  const raw = token.toLowerCase();
  if (raw === 'exit-matrix' || raw === 'exit-matrix-all' || raw === 'exit-compare') {
    return [...BENCHMARK_EXIT_MATRIX_PRESETS];
  }
  const prefix = 'exit-matrix:';
  if (!raw.startsWith(prefix)) return null;
  const body = token.slice(prefix.length).trim().toLowerCase();
  if (!body) return [...BENCHMARK_EXIT_MATRIX_PRESETS];
  return body
    .split(/[,+]/)
    .map((part) => part.trim())
    .filter((part): part is BenchmarkExitPolicy =>
      (BENCHMARK_EXIT_MATRIX_PRESETS as string[]).includes(part),
    );
}