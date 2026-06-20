import {
  PARTIAL_SCALE_FRACTION,
  PARTIAL_SCALE_TP_R,
} from '@alpha-trader/server-analysis';
import { BenchmarkExitPolicy } from '@alpha-trader/server-analysis';
import {
  TradeAction,
  TradeOutcome,
  TradeTakeProfitLevel,
} from '@alpha-trader/server-shared';

export type BenchmarkPositionPolicy = 'flat' | 'scale-ladder' | 'runner-heavy';

export type ScaleOutTier = 0 | 1 | 2 | 3;

/** Fraction of original size banked at each TP tier (must sum to 1). */
export const SCALE_LADDER_TIER_FRACTIONS: Record<1 | 2 | 3, number> = {
  1: 0.33,
  2: 0.33,
  3: 0.34,
};

export const RUNNER_HEAVY_TIER_FRACTIONS: Record<1 | 2 | 3, number> = {
  1: 0.25,
  2: 0.25,
  3: 0.5,
};

export const BENCHMARK_POSITION_MATRIX_PRESETS: BenchmarkPositionPolicy[] = [
  'flat',
  'scale-ladder',
  'runner-heavy',
];

export interface ScaleOutState {
  mode: 'partial-50' | 'ladder' | 'runner-heavy';
  bankedR: number;
  remainingFraction: number;
  tiersBanked: ScaleOutTier;
}

export function describePositionPolicy(
  policy: BenchmarkPositionPolicy = 'flat',
): string {
  if (policy === 'scale-ladder') {
    return 'Scale-out ladder (33% @ 1.5R · 33% @ 2.5R · 34% runner trailed)';
  }
  if (policy === 'runner-heavy') {
    return 'Runner-heavy ladder (25% @ 1.5R · 25% @ 2.5R · 50% runner trailed)';
  }
  return 'Flat size (single entry, full exit)';
}

export function parseBenchmarkPositionPolicy(
  token: string,
): BenchmarkPositionPolicy | null {
  const p = token.toLowerCase();
  if (
    p === 'scale-ladder' ||
    p === 'scale-ladder-out' ||
    p === 'position-ladder' ||
    p === 'partial-ladder'
  ) {
    return 'scale-ladder';
  }
  if (p === 'runner-heavy' || p === 'runner-ladder') {
    return 'runner-heavy';
  }
  if (p === 'position-flat' || p === 'flat-size') {
    return 'flat';
  }
  return null;
}

export function parsePositionMatrixToken(
  token: string,
): BenchmarkPositionPolicy[] | null {
  const p = token.toLowerCase();
  if (
    p === 'position-matrix' ||
    p === 'position-matrix-all' ||
    p === 'scale-matrix'
  ) {
    return [...BENCHMARK_POSITION_MATRIX_PRESETS];
  }
  return null;
}

export function initScaleOutState(
  positionPolicy: BenchmarkPositionPolicy = 'flat',
  exitPolicy: BenchmarkExitPolicy = 'rr-ladder',
): ScaleOutState | null {
  if (exitPolicy === 'partial-scale-50') {
    return {
      mode: 'partial-50',
      bankedR: 0,
      remainingFraction: 1,
      tiersBanked: 0,
    };
  }
  if (positionPolicy === 'scale-ladder') {
    return {
      mode: 'ladder',
      bankedR: 0,
      remainingFraction: 1,
      tiersBanked: 0,
    };
  }
  if (positionPolicy === 'runner-heavy') {
    return {
      mode: 'runner-heavy',
      bankedR: 0,
      remainingFraction: 1,
      tiersBanked: 0,
    };
  }
  return null;
}

export function tierRMultiplier(
  tiers: TradeTakeProfitLevel[],
  tier: 1 | 2 | 3,
): number {
  const tp = tiers[tier - 1];
  if (tp?.multiplier != null) return tp.multiplier;
  if (tier === 1) return 1.5;
  if (tier === 2) return 2.5;
  return 4;
}

export function updateScaleOutOnTierTouch(
  state: ScaleOutState,
  touchedTier: ScaleOutTier,
  tiers: TradeTakeProfitLevel[],
): void {
  if (touchedTier < 1) return;

  if (state.mode === 'partial-50') {
    if (state.tiersBanked === 0 && touchedTier >= 1) {
      state.tiersBanked = 1;
      state.bankedR = PARTIAL_SCALE_FRACTION * PARTIAL_SCALE_TP_R;
      state.remainingFraction = 1 - PARTIAL_SCALE_FRACTION;
    }
    return;
  }

  for (let tier = (state.tiersBanked + 1) as 1 | 2 | 3; tier <= touchedTier; tier += 1) {
    const fraction =
      state.mode === 'runner-heavy'
        ? RUNNER_HEAVY_TIER_FRACTIONS[tier]
        : SCALE_LADDER_TIER_FRACTIONS[tier];
    const tierR = tierRMultiplier(tiers, tier);
    state.bankedR = +(state.bankedR + fraction * tierR).toFixed(4);
    state.remainingFraction = +(state.remainingFraction - fraction).toFixed(4);
    state.tiersBanked = tier;
  }
}

export function hasScaleOutActivity(state: ScaleOutState | null): boolean {
  return state != null && state.tiersBanked > 0;
}

export function blendedScaleOutPnlR(
  state: ScaleOutState,
  remainderR: number,
): number {
  if (state.mode === 'partial-50') {
    return +(state.bankedR + PARTIAL_SCALE_FRACTION * remainderR).toFixed(3);
  }
  return +(state.bankedR + state.remainingFraction * remainderR).toFixed(3);
}

export function blendedScaleOutPnl(
  action: TradeAction,
  entry: number,
  risk: number,
  state: ScaleOutState,
  exitPrice: number,
): number {
  const remainderR =
    risk > 0
      ? action === 'CE-BUY'
        ? (exitPrice - entry) / risk
        : (entry - exitPrice) / risk
      : 0;
  const totalR = blendedScaleOutPnlR(state, remainderR);
  return +(totalR * risk).toFixed(2);
}

export function scaleOutHitLevel(
  state: ScaleOutState | null,
  fallback: NonNullable<TradeOutcome['hitLevel']>,
): NonNullable<TradeOutcome['hitLevel']> {
  if (!hasScaleOutActivity(state)) return fallback;
  if (state!.mode === 'partial-50') return 'PARTIAL_SCALE';
  return 'SCALE_LADDER';
}