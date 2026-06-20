import {
  PARTIAL_SCALE_FRACTION,
  PARTIAL_SCALE_TP_R,
  BenchmarkExitPolicy,
  ChandelierState,
  isCloseThroughStop,
} from '@alpha-trader/server-analysis';
import {
  BenchmarkPositionPolicy,
  SCALE_LADDER_TIER_FRACTIONS,
  ScaleOutState,
} from './position-policy.js';
import {
  FLIP_EXIT_MIN_PEAK_R,
  SESSION_END_TIGHTEN_CURRENT_R,
  SESSION_END_TIGHTEN_MINUTES,
  SESSION_END_TIGHTEN_PEAK_R,
} from '@alpha-trader/server-shared';
import { TradeSetup } from '@alpha-trader/server-shared';
import {
  isStrongOppositeSignal,
  CHANDELIER_HYBRID_MIN_PEAK_R,
  ResolvedTrailStop,
  resolveTrailStop,
  MOMENTUM_EXIT_DECAY_THRESHOLD,
  MOMENTUM_EXIT_MIN_PEAK_R,
  StructureTrailState,
  favorableR,
  floorPriceFromR,
  resolveTrailFloorR,
  signedR,
} from '@alpha-trader/server-analysis';
import { HeldDirection } from './position-monitor.js';
import { isIndexStopBreached } from './signal-exit-policy.js';

export type AutoExitHitLevel =
  | 'STOP_LOSS'
  | 'TRAIL_FLOOR'
  | 'BE'
  | 'CHANDELIER'
  | 'ATR_TIGHTEN'
  | 'STRUCTURE_TRAIL'
  | 'MOMENTUM_DECAY'
  | 'PARTIAL_SCALE'
  | 'SCALE_LADDER'
  | 'SIGNAL_FLIP'
  | 'SESSION_TIGHTEN';

export interface AutoExitSignal {
  hitLevel: AutoExitHitLevel;
  reason: string;
  /** When true, retest confirmations are skipped (hard stop / partial scale). */
  immediate: boolean;
  /** Partial close fraction when hitLevel is PARTIAL_SCALE or SCALE_LADDER. */
  partialFraction?: number;
}

export interface AutoExitEvaluationInput {
  heldDirection: HeldDirection;
  spot: number;
  peakR: number;
  tradeSetup: TradeSetup | null | undefined;
  engineAction: string;
  engineConviction: number;
  enterThreshold: number;
  signalFlipExit: boolean;
  exitPolicy?: BenchmarkExitPolicy;
  positionPolicy?: BenchmarkPositionPolicy;
  chandelier?: ChandelierState | null;
  structure?: StructureTrailState | null;
  scaleOut?: ScaleOutState | null;
  momentumDecayPercent?: number | null;
  nowMs?: number;
}

function isIstSessionTightenWindow(nowMs: number): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const minutesFromMidnight = hour * 60 + minute;
  const sessionClose = 15 * 60 + 30;
  const tightenStart = sessionClose - SESSION_END_TIGHTEN_MINUTES;
  return minutesFromMidnight >= tightenStart && minutesFromMidnight <= sessionClose;
}

function mapTrailHitLevel(
  hitLevel: ResolvedTrailStop['hitLevel'],
): AutoExitHitLevel {
  if (hitLevel === 'BE') return 'BE';
  if (hitLevel === 'CHANDELIER') return 'CHANDELIER';
  if (hitLevel === 'ATR_TIGHTEN') return 'ATR_TIGHTEN';
  if (hitLevel === 'STRUCTURE_TRAIL') return 'STRUCTURE_TRAIL';
  return 'TRAIL_FLOOR';
}

export function evaluateScaleOutSignal(
  input: Pick<
    AutoExitEvaluationInput,
    | 'heldDirection'
    | 'peakR'
    | 'tradeSetup'
    | 'exitPolicy'
    | 'positionPolicy'
    | 'scaleOut'
  >,
): AutoExitSignal | null {
  const {
    peakR,
    tradeSetup,
    exitPolicy = 'rr-ladder',
    positionPolicy = 'flat',
    scaleOut,
  } = input;

  if (!tradeSetup?.entry || tradeSetup.risk <= 0 || !scaleOut) return null;

  if (
    exitPolicy === 'partial-scale-50' &&
    scaleOut.tiersBanked === 0 &&
    peakR >= PARTIAL_SCALE_TP_R
  ) {
    return {
      hitLevel: 'PARTIAL_SCALE',
      reason: `Peak ${peakR.toFixed(2)}R reached ${PARTIAL_SCALE_TP_R}R — booking ${Math.round(PARTIAL_SCALE_FRACTION * 100)}% per partial-scale policy.`,
      immediate: true,
      partialFraction: PARTIAL_SCALE_FRACTION,
    };
  }

  if (positionPolicy === 'scale-ladder' && scaleOut.mode === 'ladder') {
    if (peakR >= 1.5 && scaleOut.tiersBanked < 1) {
      return {
        hitLevel: 'SCALE_LADDER',
        reason: `Peak ${peakR.toFixed(2)}R tagged 1.5R — scale-out tier 1 (${Math.round(SCALE_LADDER_TIER_FRACTIONS[1] * 100)}%).`,
        immediate: true,
        partialFraction: SCALE_LADDER_TIER_FRACTIONS[1],
      };
    }
    if (peakR >= 2.5 && scaleOut.tiersBanked < 2) {
      return {
        hitLevel: 'SCALE_LADDER',
        reason: `Peak ${peakR.toFixed(2)}R tagged 2.5R — scale-out tier 2 (${Math.round(SCALE_LADDER_TIER_FRACTIONS[2] * 100)}%).`,
        immediate: true,
        partialFraction: SCALE_LADDER_TIER_FRACTIONS[2],
      };
    }
    if (peakR >= 4 && scaleOut.tiersBanked < 3) {
      return {
        hitLevel: 'SCALE_LADDER',
        reason: `Peak ${peakR.toFixed(2)}R tagged 4R — scale-out tier 3 (${Math.round(SCALE_LADDER_TIER_FRACTIONS[3] * 100)}%).`,
        immediate: true,
        partialFraction: SCALE_LADDER_TIER_FRACTIONS[3],
      };
    }
  }

  return null;
}

export function evaluateBenchmarkAutoExitSignal(
  input: AutoExitEvaluationInput,
): AutoExitSignal | null {
  const {
    heldDirection,
    spot,
    peakR,
    tradeSetup,
    engineAction,
    engineConviction,
    enterThreshold,
    signalFlipExit,
    exitPolicy = 'rr-ladder',
    chandelier = null,
    structure = null,
    momentumDecayPercent = null,
    nowMs = Date.now(),
  } = input;

  if (!tradeSetup?.entry || !tradeSetup.stopLoss || tradeSetup.risk <= 0) {
    return null;
  }

  if (isIndexStopBreached(heldDirection, spot, tradeSetup)) {
    return {
      hitLevel: 'STOP_LOSS',
      reason: `Index stop breached at ${spot.toFixed(2)} (benchmark stop-loss rule).`,
      immediate: true,
    };
  }

  const trail = resolveTrailStop(
    heldDirection,
    tradeSetup,
    peakR,
    chandelier,
    structure,
    exitPolicy,
    CHANDELIER_HYBRID_MIN_PEAK_R,
  );

  if (
    exitPolicy === 'momentum-decay-exit' &&
    peakR >= MOMENTUM_EXIT_MIN_PEAK_R &&
    momentumDecayPercent != null &&
    momentumDecayPercent >= MOMENTUM_EXIT_DECAY_THRESHOLD
  ) {
    return {
      hitLevel: 'MOMENTUM_DECAY',
      reason: `Momentum decay ${momentumDecayPercent.toFixed(0)}% with peak ${peakR.toFixed(2)}R ≥ ${MOMENTUM_EXIT_MIN_PEAK_R}R — benchmark decay exit.`,
      immediate: false,
    };
  }

  if (trail && isCloseThroughStop(heldDirection, trail.stopPrice, spot)) {
    const mapped = mapTrailHitLevel(trail.hitLevel);
    const label =
      mapped === 'CHANDELIER'
        ? 'Chandelier'
        : mapped === 'ATR_TIGHTEN'
          ? 'ATR tighten'
          : mapped === 'STRUCTURE_TRAIL'
            ? 'Structure trail'
            : mapped === 'BE'
              ? 'Break-even'
            : 'R:R trail floor';
    return {
      hitLevel: mapped,
      reason: `Spot ${spot.toFixed(2)} crossed ${label} stop ${trail.stopPrice.toFixed(2)} (peak ${peakR.toFixed(2)}R, lock ${trail.exitR.toFixed(2)}R).`,
      immediate: false,
    };
  }

  if (
    signalFlipExit &&
    peakR >= FLIP_EXIT_MIN_PEAK_R &&
    isStrongOppositeSignal(heldDirection, {
      action: engineAction,
      conviction: engineConviction,
    }, enterThreshold)
  ) {
    return {
      hitLevel: 'SIGNAL_FLIP',
      reason: `Opposite ${engineAction} at ${engineConviction}% with peak ≥ ${FLIP_EXIT_MIN_PEAK_R}R — benchmark flip-exit rule.`,
      immediate: false,
    };
  }

  const currentR = signedR(heldDirection, spot, tradeSetup.entry, tradeSetup.risk);
  if (
    isIstSessionTightenWindow(nowMs) &&
    peakR >= SESSION_END_TIGHTEN_PEAK_R &&
    currentR <= SESSION_END_TIGHTEN_CURRENT_R
  ) {
    return {
      hitLevel: 'SESSION_TIGHTEN',
      reason: `Session-end fade: spot at ${currentR.toFixed(2)}R after peak ${peakR.toFixed(2)}R (last ${SESSION_END_TIGHTEN_MINUTES}m rule).`,
      immediate: false,
    };
  }

  return null;
}

export function updatePeakR(
  heldDirection: HeldDirection,
  spot: number,
  tradeSetup: TradeSetup,
  previousPeakR: number,
): number {
  const next = favorableR(
    heldDirection,
    spot,
    tradeSetup.entry,
    tradeSetup.risk,
  );
  return Math.max(previousPeakR, next);
}

export function resolveTrailFloorForDisplay(
  heldDirection: HeldDirection,
  tradeSetup: TradeSetup,
  peakR: number,
): { floorR: number; floorPrice: number } | null {
  const floorR = resolveTrailFloorR(peakR);
  if (floorR == null) return null;
  return {
    floorR,
    floorPrice: floorPriceFromR(
      heldDirection,
      tradeSetup.entry,
      tradeSetup.risk,
      floorR,
    ),
  };
}

export function resolveActiveTrailStopForDisplay(
  heldDirection: HeldDirection,
  tradeSetup: TradeSetup,
  peakR: number,
  exitPolicy: BenchmarkExitPolicy,
  chandelier: ChandelierState | null,
  structure: StructureTrailState | null,
): ResolvedTrailStop | null {
  return resolveTrailStop(
    heldDirection,
    tradeSetup,
    peakR,
    chandelier,
    structure,
    exitPolicy,
    CHANDELIER_HYBRID_MIN_PEAK_R,
  );
}