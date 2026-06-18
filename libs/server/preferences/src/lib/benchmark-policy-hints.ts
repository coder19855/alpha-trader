import {
  BENCHMARK_EXIT_MATRIX_PRESETS,
  BenchmarkExitPolicy,
} from '@alpha-trader/server-analysis';
import {
  BENCHMARK_POSITION_MATRIX_PRESETS,
  BenchmarkPositionPolicy,
} from '@alpha-trader/server-position';

export type BenchmarkExitModeHintKey = 'default' | 'single' | 'matrix';

export type BenchmarkPositionModeHintKey =
  | 'flat'
  | 'scale-ladder'
  | 'matrix';

export function describeExitModeHint(
  mode: BenchmarkExitModeHintKey,
): string {
  if (mode === 'matrix') {
    return 'Runs seven full replays on the same entries — R:R ladder, hybrid Chandelier, ATR tighten, 50% partial @ 1.5R, structure trail, momentum decay, and pure Chandelier. Results rank which exit model kept the most R.';
  }
  if (mode === 'single') {
    return 'One exit policy for the whole run. Pick a policy below — the hint updates with a concrete example of how that trail behaves.';
  }
  return 'Default R:R ladder for this run — see policy detail below. Use Single or Exit matrix to test other trailing models.';
}

export function describeExitPolicyDetail(
  policy: BenchmarkExitPolicy,
): string {
  switch (policy) {
    case 'rr-ladder':
      return 'R:R ladder — stop ratchets at fixed R floors. At 1R peak, stop moves to breakeven; floors lock at 1R (1.25R peak), 1.5R (1.5R peak), 2.5R, then 4R as price extends; beyond 4R the floor trails peak − 1R. Example: CE entry 24,000, risk 80 pts → peak 24,120 (+1.5R) floors stop at 24,120 (+1.5R); a pullback to that level exits +1.5R instead of giving back the whole move.';
    case 'chandelier-hybrid':
      return 'Hybrid — keeps R:R floors, then after 1R peak also tracks a Chandelier stop (22-bar ATR × 3 from highest high / lowest low). The tighter of R:R floor vs Chandelier wins. Example: trending day — Chandelier rides 24,000 → 24,200; choppy day — R:R floor at +1R banks profit before Chandelier whipsaws.';
    case 'atr-tighten':
      return 'ATR tighten — Chandelier-style trail starts at 3× ATR; once peak reaches 1.5R, trail tightens to 2× ATR. Example: CE from 24,000 with 80-pt risk — early move uses wide 3× room; after +120 pts (1.5R) the stop hugs closer to lock more of an extended trend.';
    case 'partial-scale-50':
      return 'Partial 50% @ 1.5R — when price tags 1.5R, half the position is booked at +1.5R and the rest keeps the R:R ladder trail. Example: 2-lot mental size — at +1.5R one lot exits for +1.5R; runner might finish +2.5R or stop at breakeven, blending to ~+2R total vs all-or-nothing.';
    case 'structure-trail':
      return 'Structure trail — after 1R peak, stop lifts to the last pullback swing low (CE) or swing high (PE), buffered by 2× ATR (1.5× after 1.5R peak), but never below the R:R floor. Example: CE stair-steps 24,000 → 24,100 → 24,080 → 24,160 — trail sits under the 24,080 pullback with ATR room instead of only a fixed R multiple.';
    case 'momentum-decay-exit':
      return 'Momentum decay — if peak reached at least +1R and 5m momentum decay score ≥ 25%, exit at market on that bar. Example: spike to +1.2R then RSI/MACD roll over on 5m — exits before a full R:R giveback when impulse fades.';
    case 'chandelier':
      return 'Pure Chandelier — 22-bar ATR × 3 trail from entry extreme only (no R:R ladder floors). Example: CE entry 24,000 — stop = highest high since entry minus 3× ATR; each new high ratchets stop up; close below stop exits. Lets winners run in trends, can give back more in ranges.';
    default:
      return describeExitPolicyDetail('rr-ladder');
  }
}

export function describePositionModeDetail(
  mode: BenchmarkPositionModeHintKey,
): string {
  switch (mode) {
    case 'scale-ladder':
      return 'Scale-out ladder — splits one logical position into thirds at R targets: 33% booked at 1.5R, 33% at 2.5R, final 34% rides the exit trail (usually to 4R or stop). Example: 3-unit risk budget — +1.5R on first third = +0.5R blended; if runner hits 4R on last third, total ≈ 0.5 + 0.83 + 1.36 ≈ +2.7R vs +4R all-in flat size.';
    case 'matrix':
      return 'Position matrix — two replays: flat size (100% one exit) vs scale-out ladder above, same entries and exit policy. Shows whether partial booking helps or hurts on your window.';
    case 'flat':
    default:
      return 'Flat size — enter once at full risk budget; entire position exits on one stop/target event. Example: +2.5R hit means the whole trade scores +2.5R. Simplest baseline; pair with exit matrix to test trails without partials.';
  }
}

export function buildExitPolicyHints(): Record<
  BenchmarkExitPolicy,
  string
> {
  const policies: BenchmarkExitPolicy[] = [
    'rr-ladder',
    'chandelier-hybrid',
    'atr-tighten',
    'partial-scale-50',
    'structure-trail',
    'momentum-decay-exit',
    'chandelier',
  ];
  return Object.fromEntries(
    policies.map((id) => [id, describeExitPolicyDetail(id)]),
  ) as Record<BenchmarkExitPolicy, string>;
}

export function buildPositionModeHints(): Record<
  BenchmarkPositionModeHintKey,
  string
> {
  return {
    flat: describePositionModeDetail('flat'),
    'scale-ladder': describePositionModeDetail('scale-ladder'),
    matrix: describePositionModeDetail('matrix'),
  };
}

export function buildExitModeHints(): Record<
  BenchmarkExitModeHintKey,
  string
> {
  return {
    default: describeExitModeHint('default'),
    single: describeExitModeHint('single'),
    matrix: describeExitModeHint('matrix'),
  };
}

const EXIT_POLICY_LABELS: Record<BenchmarkExitPolicy, string> = {
  'rr-ladder': 'R:R ladder (default)',
  'chandelier-hybrid': 'Hybrid (R:R + Chandelier)',
  'atr-tighten': 'ATR tighten (3×→2×)',
  'partial-scale-50': 'Partial 50% @ 1.5R',
  'structure-trail': 'Structure swing trail',
  'momentum-decay-exit': 'Momentum decay exit',
  chandelier: 'Chandelier ATR (pure)',
};

const POSITION_POLICY_LABELS: Record<BenchmarkPositionPolicy, string> = {
  flat: 'Flat size',
  'scale-ladder': 'Scale-out ladder',
};

export function buildAutoExitPolicyOptions(): Array<{
  id: BenchmarkExitPolicy;
  label: string;
  hint: string;
}> {
  const hints = buildExitPolicyHints();
  return BENCHMARK_EXIT_MATRIX_PRESETS.map((id: BenchmarkExitPolicy) => ({
    id,
    label: EXIT_POLICY_LABELS[id],
    hint: hints[id],
  }));
}

export function buildAutoExitPositionOptions(): Array<{
  id: BenchmarkPositionPolicy;
  label: string;
  hint: string;
}> {
  const hints = buildPositionModeHints();
  return BENCHMARK_POSITION_MATRIX_PRESETS.map((id) => ({
    id,
    label: POSITION_POLICY_LABELS[id],
    hint: hints[id],
  }));
}