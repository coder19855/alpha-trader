import { BenchmarkReport } from '../../core/services/benchmark-api.service';

export type BenchmarkExportFormat = 'summary' | 'csv' | 'json';

function shortSymbol(symbol: string): string {
  return (symbol.split(':')[1] || symbol).replace('-INDEX', '');
}

function fmtPrice(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtInr(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(Number(n));
  if (abs >= 100_000) {
    return `₹${(n / 100_000).toLocaleString('en-IN', { maximumFractionDigits: 2 })}L`;
  }
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function hitLabel(hitLevel: string, exitStatus?: string): string {
  if (hitLevel === 'STOP_LOSS' || exitStatus === 'STOP_LOSS') return 'Stop loss';
  if (hitLevel === '1:1') return 'Early 1R';
  if (hitLevel === '1:1.5') return 'TP 1:1.5';
  if (hitLevel === 'SESSION_TIGHTEN') return 'Session tighten';
  if (hitLevel === '1:2.5') return 'TP 1:2.5';
  if (hitLevel === '1:4') return 'TP 1:4';
  if (hitLevel === 'TRAIL_FLOOR') return 'Trail floor';
  if (hitLevel === 'SESSION_END') return 'Session end';
  if (hitLevel === 'SIGNAL_FLIP') return 'Signal flip';
  return hitLevel;
}

function formatDeltaR(delta?: number): string {
  if (delta == null || Number.isNaN(Number(delta))) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)}R`;
}

function tpCountsLine(b: NonNullable<BenchmarkReport['aiComparison']>['baseline']): string {
  if (!b) return '—';
  const tp = b.takeProfitCounts;
  return `${tp['1:1'] ?? 0}/${tp['1:1.5'] ?? 0}/${tp['1:2.5'] ?? 0}/${tp['1:4'] ?? 0}`;
}

function formatWindowLabel(p: NonNullable<BenchmarkReport['params']>): string {
  const d = p.days ?? 14;
  if (p.windowStartDate && p.windowEndDate) {
    return `${d}d (${p.windowStartDate} → ${p.windowEndDate})`;
  }
  if (p.windowEndDate) return `${d}d → ${p.windowEndDate}`;
  return `${d}d`;
}

function formatFilterStats(
  stats: BenchmarkReport['filterStats'],
  p: NonNullable<BenchmarkReport['params']>,
): string {
  if (!stats) return '';
  const parts: string[] = [];
  if (stats.chaseBlocked > 0 || stats.chaseDecayFiltered > 0) {
    parts.push(`chase decay blocked ${stats.chaseBlocked}, filtered ${stats.chaseDecayFiltered}`);
  }
  if (stats.sessionDayBlocked > 0) {
    parts.push(`session rules blocked ${stats.sessionDayBlocked}`);
  }
  if (stats.maxTradesBlocked > 0) {
    parts.push(`max-trades cap blocked ${stats.maxTradesBlocked}`);
  }
  if (p.chaseDecay) parts.push('chase decay on');
  if (p.greenDayStop) parts.push('green day stop on');
  if (p.dailyLossCapR != null) parts.push(`loss cap ${p.dailyLossCapR}R`);
  return parts.join(' · ');
}

function fmtExcursion(t: BenchmarkReport['trades'][number]): {
  main: string;
  sub: string;
} {
  const peak = t.peakR ?? 0;
  const mae = t.maxAdverseR ?? 0;
  const giveback = t.givebackR ?? 0;
  if (peak < 0.15 && t.pnlR <= -0.9) {
    return { main: 'Straight loss', sub: `MAE ${mae.toFixed(1)}R` };
  }
  if (giveback >= 0.5 && t.pnlR < 0) {
    return {
      main: `Peak ${peak.toFixed(1)}R`,
      sub: `Gave back ${giveback.toFixed(1)}R · MAE ${mae.toFixed(1)}R`,
    };
  }
  if (giveback >= 0.35) {
    return {
      main: `Peak ${peak.toFixed(1)}R`,
      sub: `Gave back ${giveback.toFixed(1)}R`,
    };
  }
  return {
    main: peak >= 0.15 ? `Peak ${peak.toFixed(1)}R` : 'No peak',
    sub: `MAE ${mae.toFixed(1)}R`,
  };
}

function dedupeNotes(notes: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    const trimmed = note?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function formatReportSummary(report: BenchmarkReport): string {
  const p = report.params ?? {
    symbol: '',
    tradingStyle: '',
    days: 0,
  };
  const comparison = report.aiComparison ?? {
    baseline: null,
    withAi: null,
    aiAgreeOnWins: 0,
    aiAgreeOnLosses: 0,
    aiDisagreeOnWins: 0,
    aiDisagreeOnLosses: 0,
    notes: [],
  };
  const b = comparison.baseline;
  const cap = report.capitalSummary;
  const trades = report.trades ?? [];
  const sym = shortSymbol(p.symbol || '');
  const styleLabel = String(p.tradingStyle || '').toUpperCase();
  const mode = p.aiMode ?? 'off';
  const dailyCap =
    p.maxTradesPerDay != null ? `max ${p.maxTradesPerDay}/day` : 'unlimited/day';
  const generated = new Date(report.generatedAt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const lines = [
    'ALPHA TRADER BENCHMARK REPORT',
    '=============================',
    `Generated: ${generated}${
      report.durationMs != null ? ` · Run time: ${formatElapsed(report.durationMs)}` : ''
    }`,
    `${sym} · ${styleLabel} · ${formatWindowLabel(p)} · PA-only${
      p.chaseDecay ? ' · chase-decay' : ''
    } · AI ${mode} · ${dailyCap}${
      p.pnlModel === 'synthetic_weekly_option' ? ' · weekly option P&L' : ''
    }${p.greenDayStop ? ' · green ≥1R stop' : ''}${
      p.dailyLossCapR != null ? ` · day cap ${p.dailyLossCapR}R` : ''
    }`,
    '',
    'CAPITAL',
    '-------',
    `Starting: ${fmtInr(cap.startingCapitalInr)} → Ending: ${fmtInr(cap.endingCapitalInr)} (${cap.netPnlInr >= 0 ? '+' : ''}${fmtInr(cap.netPnlInr)} / ${cap.netPnlPercent >= 0 ? '+' : ''}${cap.netPnlPercent}%)`,
    `Max drawdown: ${cap.maxDrawdownPercent}% (${fmtInr(-(cap.maxDrawdownInr ?? 0))} / ${cap.maxDrawdownR}R)`,
    cap.note ?? '',
    '',
    'ENGINE SUMMARY',
    '--------------',
    ...(b
      ? [
          `Win rate: ${b.winRate}% (${b.wins}W / ${b.losses}L)`,
          `Total R: ${b.totalPnlR >= 0 ? '+' : ''}${b.totalPnlR}R (avg ${b.avgPnlR}R)`,
          `Signals: ${b.totalSignals} (${b.wins + b.losses} decided)`,
          `Early 1R/1.5/2.5/4: ${tpCountsLine(b)} · Tighten ${b.sessionTightenCount ?? 0} · Trail ${b.trailFloorCount ?? 0} · Flip ${b.signalFlipCount ?? 0} · SL ${b.stopLossCount}`,
        ]
      : ['Engine summary unavailable for this report.']),
    '',
  ];

  const filterLine = formatFilterStats(report.filterStats, p);
  if (filterLine) {
    lines.push('ENTRY FILTERS', '--------------', filterLine, '');
  }

  if (report.matrixComparison?.variants?.length) {
    const mx = report.matrixComparison;
    lines.push(
      'MATRIX COMPARISON',
      '-----------------',
      `Winner: ${mx.winnerLabel} (${mx.variants.find((v) => v.profileId === mx.winnerId)?.totalPnlR ?? ''}R)`,
      mx.baselineLabel ? `Baseline: ${mx.baselineLabel}` : '',
      ...(mx.insights ?? []),
      '',
      'Rank | Combo | Total R | Δ base | Win% | Trades | Gates',
    );
    for (const v of [...mx.variants].sort(
      (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
    )) {
      lines.push(
        `#${v.rank ?? '—'} ${v.label}: ${v.totalPnlR}R (${formatDeltaR(v.deltaVsBaselineR)} vs base) · ${v.summary.winRate}% · ${v.summary.totalSignals} trades · ${(v.gates ?? []).join(' + ')}`,
      );
    }
    lines.push(
      '',
      'Trade log below = winner only. Use Excel Matrix sheet for full table.',
      '',
    );
  }

  if (b) {
    const tp = b.takeProfitCounts;
    lines.push(
      'EXIT BREAKDOWN',
      '--------------',
      `Stop loss: ${b.stopLossCount}`,
      `Early 1R: ${tp['1:1'] ?? 0}`,
      `TP 1:1.5: ${tp['1:1.5'] ?? 0}`,
      `TP 1:2.5: ${tp['1:2.5'] ?? 0}`,
      `TP 1:4: ${tp['1:4'] ?? 0}`,
      `Trail ratchet: ${b.trailFloorCount ?? 0}`,
      `Signal flip: ${b.signalFlipCount ?? 0}`,
      `Session tighten: ${b.sessionTightenCount ?? 0}`,
      `Session end: ${b.sessionEndCount}`,
      '',
    );
  }

  lines.push(`TRADES (${trades.length})`, '------');

  if (!trades.length) {
    lines.push('No qualifying signals in this window.');
  } else {
    for (const t of trades) {
      const side = t.action === 'CE-BUY' ? 'CE' : 'PE';
      const hit = hitLabel(t.hitLevel, t.exitStatus);
      const excursion = fmtExcursion(t);
      const pnlLine = `${t.pnlR >= 0 ? '+' : ''}${t.pnlR}R${
        t.pnlInr != null ? ` (${t.pnlInr >= 0 ? '+' : ''}${fmtInr(t.pnlInr)})` : ''
      }`;
      const optLine =
        t.optionEntryPremium != null
          ? `  Opt ₹${t.optionEntryPremium}→₹${t.optionExitPremium} (δ${t.optionDelta}, DTE ${t.optionDteDays}d)`
          : null;
      lines.push(
        ...[
          `${t.sessionDate} ${fmtTime(t.signalAtISO)} · ${side} @ ${fmtPrice(t.indexEntry)}`,
          optLine,
          `  SL ${fmtPrice(t.stopLoss)} · TP ${fmtPrice(t.takeProfit1)}/${fmtPrice(t.takeProfit2)}/${fmtPrice(t.takeProfit3)}`,
          `  → ${hit} @ ${fmtPrice(t.indexExit)} · ${pnlLine}`,
          `  ${excursion.main} · ${excursion.sub}`,
        ].filter((line): line is string => Boolean(line)),
      );
      if (t.engineVerdict) lines.push(`  Engine: ${t.engineVerdict}`);
      if (t.aiVerdictSummary) lines.push(`  AI: ${t.aiVerdictSummary}`);
      lines.push('');
    }
  }

  const noteLines = dedupeNotes([
    report.stopLossNote,
    report.simulationNote,
    report.optionFlowNote,
    cap.note,
    ...(comparison.notes ?? []),
  ]);

  if (noteLines.length) {
    lines.push('NOTES', '-----', ...noteLines);
  }

  return lines.join('\n').trim();
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatReportCsv(report: BenchmarkReport): string {
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
    'optionEntryPremium',
    'optionExitPremium',
    'optionDelta',
    'optionDteDays',
    'optionLots',
    'optionLotSize',
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
    hitLabel(t.hitLevel, t.exitStatus),
    t.indexExit,
    t.pnlR,
    t.pnlInr ?? '',
    t.optionEntryPremium ?? '',
    t.optionExitPremium ?? '',
    t.optionDelta ?? '',
    t.optionDteDays ?? '',
    t.optionLots ?? '',
    t.optionLotSize ?? '',
    t.peakR ?? '',
    t.maxAdverseR ?? '',
    t.givebackR ?? '',
    t.conviction,
    t.hitLevel,
    t.engineVerdict ?? '',
    t.aiVerdictSummary ?? '',
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatReportExport(
  report: BenchmarkReport,
  format: BenchmarkExportFormat,
): string {
  if (format === 'json') {
    return JSON.stringify(report, null, 2);
  }
  if (format === 'csv') {
    return formatReportCsv(report);
  }
  return formatReportSummary(report);
}

export { fmtExcursion, fmtInr, fmtPrice, hitLabel };