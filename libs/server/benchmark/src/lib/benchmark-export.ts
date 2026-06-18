import * as XLSX from 'xlsx';
import { BenchmarkReport } from './types.js';

function shortSymbol(symbol: string): string {
  return (symbol.split(':')[1] || symbol).replace('-INDEX', '');
}

function summaryRows(report: BenchmarkReport): Array<Array<string | number>> {
  const p = report.params;
  const b = report.aiComparison.baseline;
  const cap = report.capitalSummary;
  const rows: Array<Array<string | number>> = [
    ['Field', 'Value'],
    ['Generated', report.generatedAt],
    ['Symbol', shortSymbol(p.symbol)],
    ['Style', String(p.tradingStyle)],
    ['Window days', p.days],
    ['Window start', p.windowStartDate ?? ''],
    ['Window end', p.windowEndDate ?? ''],
    ['AI mode', p.aiMode ?? 'off'],
    ['Flow mode', p.flowMode ?? 'pa-only'],
    ['P&L model', p.pnlModel ?? 'index'],
    ['Signal profile', report.signalProfileLabel ?? 'Default engine'],
    ['Starting capital INR', cap.startingCapitalInr],
    ['Ending capital INR', cap.endingCapitalInr],
    ['Net P&L INR', cap.netPnlInr],
    ['Net P&L %', cap.netPnlPercent],
    ['Max drawdown %', cap.maxDrawdownPercent],
    ['Max drawdown R', cap.maxDrawdownR],
    ['Total signals', b?.totalSignals ?? 0],
    ['Win rate %', b?.winRate ?? 0],
    ['Total R', b?.totalPnlR ?? 0],
    ['Avg R', b?.avgPnlR ?? 0],
    ['Wins', b?.wins ?? 0],
    ['Losses', b?.losses ?? 0],
    ['Stop losses', b?.stopLossCount ?? 0],
    ['Duration ms', report.durationMs ?? ''],
  ];

  if (report.matrixComparison) {
    rows.push(['', '']);
    rows.push(['Matrix winner', report.matrixComparison.winnerLabel]);
    if (report.matrixComparison.baselineLabel) {
      rows.push(['Baseline', report.matrixComparison.baselineLabel]);
    }
    for (const insight of report.matrixComparison.insights ?? []) {
      rows.push(['Insight', insight]);
    }
    rows.push(['', '']);
    rows.push([
      'Rank',
      'Preset',
      'Gates',
      'Total R',
      'Δ vs base',
      'Win %',
      'Trades',
      'Avg R',
      'SL',
    ]);
    for (const variant of report.matrixComparison.variants) {
      rows.push([
        variant.rank ?? '',
        variant.label,
        (variant.gates ?? []).join(' + '),
        variant.totalPnlR,
        variant.deltaVsBaselineR ?? '',
        variant.summary.winRate,
        variant.summary.totalSignals,
        variant.summary.avgPnlR,
        variant.summary.stopLossCount,
      ]);
    }
  }

  return rows;
}

function tradeRows(report: BenchmarkReport): Array<Array<string | number>> {
  const headers = [
    'sessionDate',
    'signalAt',
    'side',
    'entry',
    'stopLoss',
    'takeProfit1',
    'takeProfit2',
    'takeProfit3',
    'exit',
    'exitPrice',
    'pnlR',
    'pnlInr',
    'peakR',
    'maxAdverseR',
    'givebackR',
    'conviction',
    'hitLevel',
    'engineVerdict',
    'aiVerdict',
  ];

  const rows = report.trades.map((t) => [
    t.sessionDate,
    t.signalAtISO,
    t.action === 'CE-BUY' ? 'CE' : 'PE',
    t.indexEntry,
    t.stopLoss,
    t.takeProfit1,
    t.takeProfit2,
    t.takeProfit3,
    t.exitStatus,
    t.indexExit,
    t.pnlR,
    t.pnlInr ?? '',
    t.peakR ?? '',
    t.maxAdverseR ?? '',
    t.givebackR ?? '',
    t.conviction,
    t.hitLevel,
    t.engineVerdict ?? '',
    t.aiVerdictSummary ?? '',
  ]);

  return [headers, ...rows];
}

function matrixRows(report: BenchmarkReport): Array<Array<string | number>> | null {
  if (!report.matrixComparison) return null;

  const headers = [
    'rank',
    'profileId',
    'label',
    'gates',
    'totalPnlR',
    'deltaVsBaselineR',
    'winRate',
    'avgPnlR',
    'totalSignals',
    'wins',
    'losses',
    'stopLossCount',
  ];

  const rows = report.matrixComparison.variants.map((v) => [
    v.rank ?? '',
    v.profileId,
    v.label,
    (v.gates ?? []).join(' + '),
    v.totalPnlR,
    v.deltaVsBaselineR ?? '',
    v.summary.winRate,
    v.summary.avgPnlR,
    v.summary.totalSignals,
    v.summary.wins,
    v.summary.losses,
    v.summary.stopLossCount,
  ]);

  return [headers, ...rows];
}

export function buildBenchmarkExcelBuffer(report: BenchmarkReport): Buffer {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(summaryRows(report)),
    'Summary',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(tradeRows(report)),
    'Trades',
  );

  const matrix = matrixRows(report);
  if (matrix) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(matrix),
      'Matrix',
    );
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function benchmarkExcelFilename(report: BenchmarkReport): string {
  const sym = shortSymbol(report.params.symbol);
  const end = report.params.windowEndDate ?? 'latest';
  return `benchmark-${sym}-${end}-${report.params.days}d.xlsx`;
}