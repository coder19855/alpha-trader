import { CHASE_DECAY } from '@alpha-trader/server-shared';
import { TradeAction, TradeSetup } from '@alpha-trader/server-shared';

export interface ChaseDecayInput {
  action: TradeAction | 'NEUTRAL';
  primaryScore: number;
  recentMomentum?: number;
  tradeSetup?: Pick<TradeSetup, 'entry' | 'stopLoss' | 'rawStopLoss'>;
}

export interface ChaseDecayResult {
  extensionR: number;
  decayPercent: number;
  blocked: boolean;
  reasons: string[];
  setupOverrunR?: number;
}

/** How far spot has already run past a 1R-from-swing entry (late chase). */
export function computeSetupOverrunR(
  action: 'CE-BUY' | 'PE-BUY',
  setup: Pick<TradeSetup, 'entry' | 'stopLoss' | 'rawStopLoss'>,
): number {
  const { entry, stopLoss, rawStopLoss } = setup;
  if (entry <= 0 || stopLoss <= 0 || rawStopLoss <= 0) return 0;

  if (action === 'CE-BUY') {
    const risk = Math.max(0.01, entry - stopLoss);
    const swingSpan = Math.max(0, entry - rawStopLoss);
    return +Math.max(0, swingSpan / risk - 1).toFixed(2);
  }

  const risk = Math.max(0.01, stopLoss - entry);
  const swingSpan = Math.max(0, rawStopLoss - entry);
  return +Math.max(0, swingSpan / risk - 1).toFixed(2);
}

export function evaluateChaseDecay(input: ChaseDecayInput): ChaseDecayResult {
  if (input.action !== 'CE-BUY' && input.action !== 'PE-BUY') {
    return { extensionR: 0, decayPercent: 0, blocked: false, reasons: [] };
  }

  const cfg = CHASE_DECAY;
  const isBull = input.action === 'CE-BUY';
  const alignedScore = isBull ? input.primaryScore : -input.primaryScore;
  const alignedMom = isBull
    ? (input.recentMomentum ?? 0)
    : -(input.recentMomentum ?? 0);

  const scoreExt = Math.max(0, alignedScore - cfg.SCORE_BASELINE) * cfg.SCORE_TO_R;
  const momExt = Math.max(0, alignedMom - cfg.MOM_BASELINE) * cfg.MOM_TO_R;
  const setupOverrunR = input.tradeSetup
    ? computeSetupOverrunR(input.action, input.tradeSetup)
    : 0;

  const extensionR = +Math.min(
    cfg.MAX_EXTENSION_R,
    Math.max(scoreExt, momExt, setupOverrunR),
  ).toFixed(2);

  if (extensionR < cfg.EXTENSION_START_R) {
    return {
      extensionR,
      decayPercent: 0,
      blocked: false,
      reasons: [],
      setupOverrunR: setupOverrunR || undefined,
    };
  }

  if (extensionR >= cfg.EXTENSION_BLOCK_R) {
    const reasons = [
      `Move already extended ~${extensionR.toFixed(1)}R before entry — blocked`,
    ];
    if (setupOverrunR >= cfg.EXTENSION_START_R) {
      reasons.unshift(
        `Entry ${setupOverrunR.toFixed(1)}R past swing risk (late chase)`,
      );
    }
    return {
      extensionR,
      decayPercent: 1,
      blocked: true,
      reasons,
      setupOverrunR: setupOverrunR || undefined,
    };
  }

  const decayPercent = Math.min(
    cfg.MAX_DECAY,
    (extensionR - cfg.EXTENSION_START_R) * cfg.DECAY_PER_R,
  );

  const reasons: string[] = [];
  if (setupOverrunR >= cfg.EXTENSION_START_R) {
    reasons.push(
      `Entry ${setupOverrunR.toFixed(1)}R past swing risk (late chase)`,
    );
  } else if (scoreExt >= momExt && scoreExt > 0) {
    reasons.push(
      `Primary TF already extended (~${scoreExt.toFixed(1)}R)`,
    );
  } else if (momExt > 0) {
    reasons.push(
      `Recent candles already ran (~${momExt.toFixed(1)}R)`,
    );
  }

  return {
    extensionR,
    decayPercent: +decayPercent.toFixed(3),
    blocked: false,
    reasons,
    setupOverrunR: setupOverrunR || undefined,
  };
}

export function applyChaseDecayToConviction(
  conviction: number,
  chase: ChaseDecayResult,
): number {
  if (chase.blocked) return 0;
  if (chase.decayPercent <= 0) return conviction;
  return Math.max(0, Math.round(conviction * (1 - chase.decayPercent)));
}

export const CHASE_DECAY_BENCHMARK_NOTE =
  'Chase decay: penalize/block when primary score, recent momentum, or swing overrun shows the move already extended (late 95% entries).';