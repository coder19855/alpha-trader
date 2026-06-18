import { AIAnalysisResponse } from './benchmark-stubs.js';
import { BenchmarkAiMode, BenchmarkTradeRow } from './types.js';

export function buildTradeExcursionSummary(row: {
  peakR: number;
  maxAdverseR: number;
  givebackR: number;
  pnlR: number;
}): string {
  const peak = row.peakR ?? 0;
  const mae = row.maxAdverseR ?? 0;
  const giveback = row.givebackR ?? 0;

  if (peak < 0.15 && row.pnlR <= -0.9) {
    return 'Straight loss — never reached 1:1.5.';
  }
  if (giveback >= 0.5 && row.pnlR < 0) {
    return `Peaked ${peak.toFixed(1)}R then gave back ${giveback.toFixed(1)}R (MAE ${mae.toFixed(1)}R).`;
  }
  if (giveback >= 0.35) {
    return `Peaked ${peak.toFixed(1)}R — gave back ${giveback.toFixed(1)}R before exit.`;
  }
  if (peak >= 0.15) {
    return `Peak ${peak.toFixed(1)}R · MAE ${mae.toFixed(1)}R.`;
  }
  return `MAE ${mae.toFixed(1)}R.`;
}

export function buildEngineVerdict(row: {
  action: string;
  conviction: number;
  hitLevel: string;
  exitStatus: string;
  pnlR: number;
  optionSource: string;
  peakR?: number;
  maxAdverseR?: number;
  givebackR?: number;
}): string {
  const parts: string[] = [];
  parts.push(`${row.action} @ ${row.conviction}% conviction`);

  if (row.exitStatus === 'STOP_LOSS') {
    parts.push('Stop loss hit — structure failed to follow through.');
  } else if (row.hitLevel === 'BE') {
    parts.push('Locked Break-Even (0R) on reversal — protected capital after early extension.');
  } else if (row.hitLevel === '1:2.5') {
    parts.push('Locked 1:2.5 on reversal after extension — disciplined trail exit.');
  } else if (row.hitLevel === '1:1.5') {
    parts.push('Locked 1:1.5 on reversal — partial move captured.');
  } else if (row.hitLevel === '1:4') {
    parts.push('Extended past 1:4 — held until flip, floor, or session end.');
  } else if (row.hitLevel === '1:3') {
    parts.push('Full 1:3 target reached — strong trend follow-through.');
  } else if (row.hitLevel === '1:2') {
    parts.push('Locked 1:2 on reversal after extension — disciplined trail exit.');
  } else if (row.hitLevel === '1:1') {
    parts.push('Locked 1:1 on reversal — partial move captured.');
  } else if (row.hitLevel === 'CHANDELIER') {
    parts.push(
      `Chandelier ATR trail at ${row.pnlR}R — volatility-adjusted stop protected open gains.`,
    );
  } else if (row.hitLevel === 'ATR_TIGHTEN') {
    parts.push(
      `ATR tighten trail at ${row.pnlR}R — widened early, tightened after 1.5R peak.`,
    );
  } else if (row.hitLevel === 'PARTIAL_SCALE') {
    parts.push(
      `50% scaled at 1.5R — blended exit at ${row.pnlR}R on remainder trail.`,
    );
  } else if (row.hitLevel === 'SCALE_LADDER') {
    parts.push(
      `Scale-out ladder (33/33/34 @ TP tiers) — blended exit at ${row.pnlR}R on runner trail.`,
    );
  } else if (row.hitLevel === 'STRUCTURE_TRAIL') {
    parts.push(
      `Structure trail at ${row.pnlR}R — swing pullback + ATR buffer breach.`,
    );
  } else if (row.hitLevel === 'MOMENTUM_DECAY') {
    parts.push(
      `Momentum decay exit at ${row.pnlR}R — 5m follow-through faded after ≥1R peak.`,
    );
  } else if (row.hitLevel === 'TRAIL_FLOOR') {
    parts.push(
      `Dynamic trail floor at ${row.pnlR}R — ratchet protected extension from peak.`,
    );
  } else if (row.hitLevel === 'SIGNAL_FLIP') {
    parts.push(
      'Exited on strong engine flip while in profit — protected open gains.',
    );
  } else if (row.hitLevel === 'SESSION_TIGHTEN') {
    parts.push(
      'Session fade tighten — peak ≥1R but spot faded to ≤0.5R in last 45m; booked remainder.',
    );
  } else if (row.exitStatus === 'SESSION_END') {
    parts.push('Held to session close without SL/TP — time stop.');
  }

  if (row.pnlR >= 1.5) parts.push('Spot move exceeded 1.5R.');
  else if (row.pnlR <= -0.9) parts.push('Full risk unit lost on spot.');

  if (row.optionSource === 'neutral_fallback') {
    parts.push('Option flow neutral (no snapshot) — PA-weighted read.');
  }

  if (row.peakR != null && row.givebackR != null) {
    parts.push(
      buildTradeExcursionSummary({
        peakR: row.peakR,
        maxAdverseR: row.maxAdverseR ?? 0,
        givebackR: row.givebackR,
        pnlR: row.pnlR,
      }),
    );
  }

  return parts.join(' ');
}

export function buildAiVerdictSummary(
  ai: AIAnalysisResponse | undefined,
  _row: BenchmarkTradeRow,
  aiMode: BenchmarkAiMode = 'off',
): string | undefined {
  if (aiMode === 'off' || !ai) {
    return undefined;
  }
  if (aiMode === 'shadow' || aiMode === 'active') {
    return 'AI not available in alpha-trader benchmark (stub mode).';
  }
  return undefined;
}