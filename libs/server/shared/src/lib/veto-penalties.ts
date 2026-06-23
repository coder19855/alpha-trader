import { VetoMode, isVetoOff } from './types/veto-mode.js';

export interface VetoPenaltyEntry {
  label: string;
  points: number;
}

/** Mode multipliers for structural confidence penalties. */
export const VETO_PENALTY_MODE_MULTIPLIER: Record<VetoMode, number> = {
  strict: 1,
  relaxed: 0.45,
  off: 0,
};

export const VETO_PENALTY_LIMITS = {
  /** Max total structural penalty points (strict mode, before multiplier cap). */
  MAX_STRUCTURAL: 45,
} as const;

/** Base penalty points (strict mode = 1.0×). */
export const VETO_PENALTY_BASE = {
  SCALPER_15M_OPPOSES: 20,
  SCALPER_WEAK_PRIMARY: 15,
  INTRADAY_LOW_ALIGNMENT: 18,
  INTRADAY_WEAK_PRIMARY: 16,
  POSITIONAL_WEAK_1H: 22,
  POSITIONAL_WEAK_15M: 18,
  POSITIONAL_WEAK_PRIMARY: 20,
  CHOP_REGIME: 14,
  RANGE_COMPRESSION: 12,
  BREAKOUT_NO_SR: 22,
  BREAKOUT_NO_BUILDUP: 15,
  BREAKOUT_NO_DATA: 15,
  REVERSAL_CLIMAX: 12,
  OPPOSE_5M: 18,
  PRIMARY_STRUCTURE_OPPOSES: 20,
  STACKED_OPPOSING_15M: 22,
  CE_WEAK_ADX_OB: 18,
  SOFT_ADX_CHOP: 12,
  CE_1H_CLEARLY_BEARISH: 24,
  CE_1H_MILD_BEARISH: 20,
  PE_1H_MILD_BULLISH: 20,
  PE_NEAR_SUPPORT: 28,
  OPPOSING_CANDLESTICK: 15,
  DOJI_WEAK_15M: 14,
  WEAK_TREND_QUALITY: 14,
  OPPOSING_CHART_PATTERN: 25,
  MIDDAY_CHOP: 10,
  STRONG_1H_OPPOSES: 26,
  SOFT_DECAY_BELOW_MIN: 18,
  OPPOSED_STRUCTURE_DECAY: 16,
  BLEND_OPTION_STRONGLY_AGAINST: 24,
  BLEND_NO_TF_ALIGNMENT: 15,
} as const;

export function vetoPenaltyMultiplier(mode: VetoMode): number {
  return VETO_PENALTY_MODE_MULTIPLIER[mode];
}

export function scaleVetoPenalty(mode: VetoMode, basePoints: number): number {
  if (isVetoOff(mode) || basePoints <= 0) return 0;
  return Math.round(basePoints * vetoPenaltyMultiplier(mode));
}

export class VetoPenaltyLedger {
  private total = 0;

  readonly entries: VetoPenaltyEntry[] = [];

  constructor(private readonly mode: VetoMode) {}

  apply(label: string, basePoints: number): number {
    const scaled = scaleVetoPenalty(this.mode, basePoints);
    if (scaled <= 0) return 0;
    const room = VETO_PENALTY_LIMITS.MAX_STRUCTURAL - this.total;
    const applied = Math.min(scaled, Math.max(0, room));
    if (applied <= 0) return 0;
    this.total += applied;
    this.entries.push({ label, points: applied });
    return applied;
  }

  get totalPoints(): number {
    return this.total;
  }
}

/** Hard blocks that still apply in strict + relaxed (not converted to penalties). */
export function isHardVetoReason(reason?: string): boolean {
  if (!reason) return false;
  return (
    /hard decay/i.test(reason) ||
    /dead market/i.test(reason) ||
    /chase block/i.test(reason) ||
    /session overlap/i.test(reason) ||
    /session cooldown/i.test(reason)
  );
}