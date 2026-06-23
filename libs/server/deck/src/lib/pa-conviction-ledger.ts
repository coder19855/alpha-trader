export interface PaConvictionBonus {
  label: string;
  points: number;
}

export interface PaConvictionLedgerInput {
  confidence: number;
  confidenceBeforeDecay?: number;
  entryPenalties?: Array<{ label: string; points: number }>;
  momentumDecayPercent?: number | null;
}

export interface PaConvictionLedger {
  baseConviction: number;
  bonuses: PaConvictionBonus[];
  entryConviction: number;
}

/**
 * Builds a PA % breakdown: base + bonuses/penalties → final confidence.
 * Penalties from chart gates are negative points; decay is shown separately when not already listed.
 */
export function buildPaConvictionLedger(
  input: PaConvictionLedgerInput,
): PaConvictionLedger {
  const final = Math.round(Math.max(0, Math.min(95, input.confidence)));
  const penalties = input.entryPenalties ?? [];

  const bonuses: PaConvictionBonus[] = penalties.map((row) => ({
    label: row.label,
    points: -Math.abs(row.points),
  }));

  const decayPct = input.momentumDecayPercent ?? 0;
  const hasDecayPenalty = penalties.some((row) => /decay/i.test(row.label));
  if (decayPct > 0 && !hasDecayPenalty) {
    const beforeDecay = Math.round(
      input.confidenceBeforeDecay ?? final,
    );
    const penaltyTotal = penalties.reduce((sum, row) => sum + row.points, 0);
    const decayPoints = Math.max(0, beforeDecay - final - penaltyTotal);
    if (decayPoints > 0) {
      bonuses.push({
        label: `Momentum decay (${Math.round(decayPct * 100)}%)`,
        points: -decayPoints,
      });
    }
  }

  const bonusTotal = bonuses.reduce((sum, row) => sum + row.points, 0);
  const baseConviction = Math.min(
    95,
    Math.max(0, Math.round(final - bonusTotal)),
  );

  return {
    baseConviction,
    bonuses,
    entryConviction: final,
  };
}