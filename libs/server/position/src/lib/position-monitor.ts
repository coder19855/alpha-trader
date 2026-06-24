import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import { resolveOpenPositionsRestReconcileMs } from '@alpha-trader/server-shared';
import { resolveOpenPositionsCacheTtlMs } from '@alpha-trader/server-shared';
import {
  clearOpenPositionsCache as clearLivePositionsCache,
  getOpenPositionsCacheSnapshot,
  isOpenPositionsWsLive,
  mapFyersPositionRowToMonitorContext,
  seedOpenPositionsCache,
} from '@alpha-trader/server-market-data';
import { getStyleScoringConfig } from '@alpha-trader/server-shared';
import { ResponseStatus } from '@alpha-trader/server-shared';
import { PriceActionResponse } from '@alpha-trader/server-shared';
import {
  OpenPositionMonitorContext,
  TradeDecisionAlertPayload,
} from '@alpha-trader/server-shared';
import { DecisionAction } from '@alpha-trader/server-shared';
import { isIndexStopBreached } from '@alpha-trader/server-shared';
import {
  highestTpHit,
} from '@alpha-trader/server-analysis';
import { resolveHeldPositionTradeSetup } from './held-position-trade-setup.js';

export type HeldDirection = 'CE-BUY' | 'PE-BUY';

export interface OpenPositionContext {
  positions: OpenPositionMonitorContext[];
  heldDirection: HeldDirection | null;
  isMixedDirections: boolean;
  count: number;
  fetchSucceeded: boolean;
  fetchError?: string;
}

/**
 * First-class Management Brain output.
 * This is the core improvement: when the user has live risk, the system produces
 * rich, actionable management guidance instead of (or in addition to) raw entry signals.
 */
export interface ManagementAdvice {
  mode: 'MANAGEMENT' | 'FLAT';
  heldDirection: HeldDirection | null;
  isMixedDirections: boolean;
  positionCount: number;

  /** High-level recommended stance for the existing position(s) */
  overall: 'STRONG_HOLD' | 'HOLD' | 'PARTIAL_BOOK' | 'TRAIL' | 'EXIT_SOON' | 'HARD_EXIT' | 'CONFLICT' | 'WATCH';

  headline: string;
  reasons: string[];

  /** Concrete actions the user should consider right now */
  recommendedActions: Array<{
    action: 'BOOK_PARTIAL' | 'BOOK_ALL' | 'MOVE_STOP_TO_BREAKEVEN' | 'TRAIL_STOP' | 'TIGHTEN_STOP' | 'MONITOR' | 'SCALE_OUT_AT_TP' | 'CONSIDER_ADD_ON_WEAKNESS';
    detail: string;
    rrTarget?: RrLabel | 'current' | 'breakeven';
  }>;

  currentR: number | null;
  highestHitRr: RrLabel | null;

  /** Index-spot R:R ladder for deck open-position tracker UI. */
  rrTracker?: PositionRrTracker;

  /** How well the current engine read supports the held direction */
  alignment: 'ALIGNED' | 'WEAKENING' | 'OPPOSITE' | 'NEUTRAL';

  /** 0-100 score of how suitable it is to continue holding the current position */
  holdSuitability: number;

  /** Suggested adjustments for risk on the existing position (not new entries) */
  riskAdjustment: {
    suggestedAction: 'MAINTAIN' | 'REDUCE_SIZE' | 'TIGHTEN_RISK' | 'LET_RUN';
    notes: string[];
  };

  /** Dynamic stop suggestion based on current market structure (if better than original) */
  suggestedStopAdjustment?: {
    newStop: number;
    reason: string;
    improvement: string;
  };

  source: 'live_position';

  /** 
   * Synthesized Position Health Score — the "at a glance" health of your open position.
   * This is a major UX improvement for the management brain.
   */
  positionHealth: PositionHealth;
}

export interface PositionRrTrackerLevel {
  id: string;
  label: string;
  rr: number;
  price: number;
  kind: 'stop' | 'entry' | 'be' | 'tp';
}

export interface PositionRrTracker {
  direction: 'CE-BUY' | 'PE-BUY';
  entry: number;
  stopLoss: number;
  risk: number;
  spot: number;
  currentR: number | null;
  highestHitRr: RrLabel | null;
  levels: PositionRrTrackerLevel[];
}

export interface PositionHealth {
  score: number;                    // 0-100
  label: 'Excellent' | 'Good' | 'Fair' | 'Caution' | 'Exit Zone';
  trend: 'improving' | 'stable' | 'deteriorating' | 'unknown';
  breakdown: Array<{
    factor: string;
    contribution: number;           // -30 to +30 roughly
    note: string;
  }>;
  previousScore?: number;
}

import type { AutoExitOptionLegTelemetry } from './option-premium-exit.js';

export type { AutoExitOptionLegTelemetry };

export interface AutoExitGuardStatus {
  enabled: boolean;
  retestCount: number;
  exitPolicy: string;
  positionPolicy: string;
  optionPremiumExit?: boolean;
  optionPremiumStopPct?: number;
  confirmationsRequired: number;
  confirmationCount: number;
  pendingHitLevel: string | null;
  peakR: number | null;
  indexSpot?: number | null;
  trailFloorPrice: number | null;
  trailFloorR: number | null;
  trailStopPrice: number | null;
  trailStopLabel: string | null;
  scaleOutNote: string | null;
  optionLegs?: AutoExitOptionLegTelemetry[];
  status: 'off' | 'watching' | 'pending' | 'executed' | 'blocked';
  message: string;
  lastExecutedAt: string | null;
  lastEvaluatedAt?: string | null;
  recentEvents?: AutoExitTraceEvent[];
}

export interface AutoEntryGuardStatus {
  enabled: boolean;
  dryRun: boolean;
  armedLive: boolean;
  signalMode: string;
  signalProfile: string;
  entryThreshold: number;
  lots: number;
  maxEntriesPerDay: number;
  greenDayStop: boolean;
  entriesToday: number;
  dryRunsToday: number;
  greenDayLocked: boolean;
  confirmationCount: number;
  confirmationsRequired: number;
  pendingAction: string | null;
  status: 'off' | 'watching' | 'pending' | 'executed' | 'blocked' | 'simulated';
  message: string;
  lastExecutedAt: string | null;
  lastEvaluatedAt?: string | null;
  pendingReason?: string | null;
  recentEvents?: AutoEntryTraceEvent[];
}

export interface PositionManagementContext {
  hasOpenPosition: boolean;
  heldDirection?: HeldDirection | null;
  isMixedDirections?: boolean;
  count?: number;
  advice?: ManagementAdvice;
  note?: string;
  health?: PositionHealth;
  autoExit?: AutoExitGuardStatus;
  autoEntry?: AutoEntryGuardStatus;
}
import {
  RrLabel,
  TradeAction,
  TradeSetup,
  TradingStyle,
} from '@alpha-trader/server-shared';
import type { AutoEntryTraceEvent } from './auto-entry-state.js';
import type { AutoExitTraceEvent } from './auto-exit-state.js';

function signalSupportsPosition(
  positionDirection: 'CE-BUY' | 'PE-BUY',
  signalAction: DecisionAction,
  paAction: string,
): boolean {
  if (positionDirection === 'CE-BUY') {
    return signalAction === 'CE-BUY' || paAction === 'CE-BUY';
  }
  return signalAction === 'PE-BUY' || paAction === 'PE-BUY';
}

function currentRMultiple(
  direction: TradeAction,
  spot: number,
  setup: TradeSetup,
): number {
  if (setup.risk <= 0) return 0;
  if (direction === 'CE-BUY') return (spot - setup.entry) / setup.risk;
  if (direction === 'PE-BUY') return (setup.entry - spot) / setup.risk;
  return 0;
}

/**
 * Position Health Score — synthesizes many signals into one intuitive 0-100 health metric
 * for an open position. This is what makes the management experience feel premium.
 */
export function computePositionHealthScore(
  positionContext: OpenPositionContext,
  decision: TradeDecisionAlertPayload,
  priceData: PriceActionResponse,
  tradingStyle: TradingStyle,
  previousHealthScore?: number,
): PositionHealth {
  const { heldDirection, count } = positionContext;

  if (!heldDirection || count === 0) {
    return {
      score: 50,
      label: 'Fair',
      trend: 'unknown',
      breakdown: [{ factor: 'No position', contribution: 0, note: 'No open leg detected' }],
    };
  }

  const tradeSetup = priceData.tradeSetup;
  const conviction = decision.conviction ?? 0;
  const momentumDecay = priceData.momentumDecay?.decayPercent ?? 0;
  const thresholds = getStyleScoringConfig(tradingStyle).convictionThreshold;

  const aligned = signalSupportsPosition(heldDirection, decision.action, decision.priceAction.action);
  const paMatches = decision.priceAction.action === heldDirection;

  let currentR = 0;
  let highestHitRr: RrLabel | null = null;
  if (tradeSetup?.risk && tradeSetup.risk > 0 && tradeSetup.takeProfits?.length) {
    currentR = currentRMultiple(heldDirection, priceData.lastPrice, tradeSetup);
    const spotHit = highestTpHit(heldDirection, priceData.lastPrice, tradeSetup.takeProfits);
    highestHitRr = spotHit?.rr ?? null;
  }

  const stopBreached = tradeSetup?.stopLoss
    ? isIndexStopBreached(heldDirection!, priceData.lastPrice, tradeSetup)
    : false;

  const breakdown: PositionHealth['breakdown'] = [];

  let score = 60; // neutral starting point for a live position

  // Alignment (very important)
  if (aligned && paMatches) {
    const bonus = 18;
    score += bonus;
    breakdown.push({ factor: 'Engine Alignment', contribution: bonus, note: 'Current signals support your held direction' });
  } else if (!aligned) {
    const penalty = -22;
    score += penalty;
    breakdown.push({ factor: 'Engine Alignment', contribution: penalty, note: 'Engine has turned against your position' });
  } else {
    const smallPenalty = -8;
    score += smallPenalty;
    breakdown.push({ factor: 'Engine Alignment', contribution: smallPenalty, note: 'Price action and overall signal are not perfectly in sync' });
  }

  // Conviction
  let convContrib = 0;
  if (conviction >= thresholds.strong) convContrib = 14;
  else if (conviction >= thresholds.enter) convContrib = 6;
  else convContrib = -16;
  score += convContrib;
  breakdown.push({ 
    factor: 'Conviction', 
    contribution: convContrib, 
    note: conviction >= thresholds.strong ? 'Strong confluence for the style' : conviction >= thresholds.enter ? 'Meets entry threshold' : 'Below style entry bar' 
  });

  // Momentum Decay (critical for options)
  let decayContrib = 0;
  if (momentumDecay >= 35) decayContrib = -28;
  else if (momentumDecay >= 22) decayContrib = -16;
  else if (momentumDecay >= 12) decayContrib = -6;
  else if (momentumDecay < 8) decayContrib = +5;
  score += decayContrib;
  if (Math.abs(decayContrib) > 2) {
    breakdown.push({ factor: 'Momentum Decay', contribution: decayContrib, note: `${momentumDecay.toFixed(0)}% decay — ${decayContrib < 0 ? 'edge fading' : 'momentum clean'}` });
  }

  // R-multiple achieved (profit already locked in)
  let rContrib = 0;
  if (currentR >= 2.5) rContrib = 12;
  else if (currentR >= 1.5) rContrib = 7;
  else if (currentR >= 0.8) rContrib = 2;
  else if (currentR < 0) rContrib = -10;
  score += rContrib;
  if (Math.abs(rContrib) > 1) {
    breakdown.push({ factor: 'R Multiple', contribution: rContrib, note: currentR >= 1.5 ? `Banked ${currentR.toFixed(1)}R` : `Only ${currentR.toFixed(1)}R so far` });
  }

  // TP milestones (trailing ladder 1:1.5 → 1:2.5 → 1:4)
  if (highestHitRr === '1:4') {
    score += 6;
    breakdown.push({ factor: 'TP Milestone', contribution: 6, note: '1:4 touched — trail with 1:2.5 floor' });
  } else if (highestHitRr === '1:2.5') {
    score += 4;
    breakdown.push({ factor: 'TP Milestone', contribution: 4, note: '1:2.5 locked — runner toward 1:4' });
  } else if (highestHitRr === '1:1.5') {
    score += 2;
    breakdown.push({ factor: 'TP Milestone', contribution: 2, note: '1:1.5 locked — partial + trail' });
  } else if (highestHitRr === '1:1') {
    score += 1;
    breakdown.push({ factor: 'TP Milestone', contribution: 1, note: '1R early lock — partial + trail' });
  }

  // Stop / structure risk
  if (stopBreached) {
    score = Math.min(score, 18);
    breakdown.push({ factor: 'Stop Risk', contribution: -25, note: 'Stop level breached' });
  } else if (tradeSetup && priceData.levels) {
    const distToStop = heldDirection === 'CE-BUY' 
      ? priceData.lastPrice - tradeSetup.stopLoss 
      : tradeSetup.stopLoss - priceData.lastPrice;
    if (distToStop < (tradeSetup.risk || 10) * 0.6) {
      const penalty = -9;
      score += penalty;
      breakdown.push({ factor: 'Stop Proximity', contribution: penalty, note: 'Close to stop — manage risk tightly' });
    }
  }

  // Style adjustment (scalpers are more sensitive to decay)
  if (tradingStyle === 'SCALPER' && momentumDecay > 15) {
    score -= 6;
    breakdown.push({ factor: 'Style Fit', contribution: -6, note: 'High decay hurts scalping style more' });
  }

  // Clamp and label
  score = Math.max(5, Math.min(95, Math.round(score)));

  let label: PositionHealth['label'] = 'Fair';
  if (score >= 82) label = 'Excellent';
  else if (score >= 68) label = 'Good';
  else if (score >= 48) label = 'Fair';
  else if (score >= 32) label = 'Caution';
  else label = 'Exit Zone';

  // Trend
  let trend: PositionHealth['trend'] = 'unknown';
  if (previousHealthScore != null) {
    const delta = score - previousHealthScore;
    if (delta > 6) trend = 'improving';
    else if (delta < -6) trend = 'deteriorating';
    else trend = 'stable';
  }

  return {
    score,
    label,
    trend,
    breakdown: breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5),
    previousScore: previousHealthScore,
  };
}

/**
 * THE MANAGEMENT BRAIN.
 * 
 * This is the key improvement for pushing the bot toward 9/10.
 * It takes the raw entry-oriented decision + live Fyers positions and produces
 * a rich, position-centric set of advice.
 *
 * It does NOT change the core decision engine. It sits on top as the "management layer".
 */
export function computeManagementAdvice(
  positionContext: OpenPositionContext,
  decision: TradeDecisionAlertPayload,
  priceData: PriceActionResponse,
  tradingStyle: TradingStyle,
  options?: { entrySpot?: number | null },
): ManagementAdvice {
  const { heldDirection, isMixedDirections, count } = positionContext;

  if (count === 0 || !heldDirection) {
    return {
      mode: 'FLAT',
      heldDirection: null,
      isMixedDirections: false,
      positionCount: 0,
      overall: 'WATCH',
      headline: 'No open positions on watched indexes.',
      reasons: [],
      recommendedActions: [{ action: 'MONITOR', detail: 'System is in entry mode.' }],
      currentR: null,
      highestHitRr: null,
      alignment: 'NEUTRAL',
      holdSuitability: 50,
      riskAdjustment: { suggestedAction: 'MAINTAIN', notes: [] },
      source: 'live_position',
      positionHealth: {
        score: 50,
        label: 'Fair',
        trend: 'unknown',
        breakdown: [{ factor: 'No position', contribution: 0, note: 'No open leg detected' }],
      },
    };
  }

  const tradeSetup = resolveHeldPositionTradeSetup(heldDirection, priceData, {
    entrySpot: options?.entrySpot,
  });

  // Base calculations (reuse existing helpers where possible)
  let currentR: number | null = null;
  let highestHitRr: RrLabel | null = null;

  if (tradeSetup?.risk && tradeSetup.risk > 0 && tradeSetup.takeProfits?.length) {
    currentR = currentRMultiple(heldDirection, priceData.lastPrice, tradeSetup);
    const spotHit = highestTpHit(heldDirection, priceData.lastPrice, tradeSetup.takeProfits);
    highestHitRr = spotHit?.rr ?? null;
  }

  const aligned = signalSupportsPosition(heldDirection, decision.action, decision.priceAction.action);
  const paMatches = decision.priceAction.action === heldDirection;
  const conviction = decision.conviction ?? 0;
  const momentumDecay = priceData.momentumDecay?.decayPercent ?? 0;

  const thresholds = getStyleScoringConfig(tradingStyle).convictionThreshold;

  // Alignment assessment
  let alignment: ManagementAdvice['alignment'] = 'ALIGNED';
  if (!aligned) alignment = 'OPPOSITE';
  else if (momentumDecay >= 25 || conviction < thresholds.enter) alignment = 'WEAKENING';
  else if (!paMatches) alignment = 'WEAKENING';

  // Hold suitability score (0-100) - this is the heart of the management brain
  let holdSuitability = 65; // baseline

  if (aligned && paMatches) holdSuitability += 20;
  if (conviction >= thresholds.strong) holdSuitability += 12;
  else if (conviction < thresholds.enter) holdSuitability -= 18;

  if (momentumDecay >= 30) holdSuitability -= 25;
  else if (momentumDecay >= 15) holdSuitability -= 10;

  if (highestHitRr === '1:4') holdSuitability += 8;
  if (highestHitRr === '1:2.5') holdSuitability += 5;

  // Stop breach check using current structure (better than static)
  const currentStopBreached = tradeSetup?.stopLoss
    ? isIndexStopBreached(heldDirection!, priceData.lastPrice, tradeSetup)
    : false;

  if (currentStopBreached) holdSuitability = Math.min(holdSuitability, 15);

  holdSuitability = Math.max(5, Math.min(95, Math.round(holdSuitability)));

  // Determine overall stance
  let overall: ManagementAdvice['overall'] = 'HOLD';
  const reasons: string[] = [];

  if (currentStopBreached) {
    overall = 'HARD_EXIT';
    reasons.push('Index stop level has been breached.');
  } else if (!aligned && conviction >= thresholds.enter) {
    overall = 'EXIT_SOON';
    reasons.push('Opposite engine read building — exit on 2-poll confirmation or trail floor.');
  } else if (alignment === 'WEAKENING' && momentumDecay >= 20) {
    overall = 'PARTIAL_BOOK';
    reasons.push('Momentum decay elevated and conviction softening — book some size.');
  } else if (highestHitRr === '1:4') {
    overall = 'TRAIL';
    reasons.push('Past 1:4 — hold for extension; trail with 1:2.5 floor or exit on confirmed flip.');
  } else if (highestHitRr === '1:2.5' && conviction >= thresholds.strong) {
    overall = 'TRAIL';
    reasons.push('1:2.5 locked with strong conviction — trail toward 1:4.');
  } else if (holdSuitability < 40) {
    overall = 'EXIT_SOON';
    reasons.push(`Hold suitability is low (${holdSuitability}%).`);
  } else if (holdSuitability >= 80 && alignment === 'ALIGNED') {
    overall = 'STRONG_HOLD';
  } else if (holdSuitability < 55) {
    overall = 'CONFLICT';
  }

  // Build concrete recommended actions (this is what makes it feel like a real management brain)
  const recommendedActions: ManagementAdvice['recommendedActions'] = [];

  if (overall === 'HARD_EXIT' || overall === 'EXIT_SOON') {
    recommendedActions.push({ action: 'BOOK_ALL', detail: 'Exit the position — engine no longer supports the trade.' });
  } else if (overall === 'PARTIAL_BOOK') {
    recommendedActions.push({ action: 'BOOK_PARTIAL', detail: 'Book 40-60% into strength or at current R-multiple.', rrTarget: highestHitRr ?? 'current' });
    recommendedActions.push({ action: 'MOVE_STOP_TO_BREAKEVEN', detail: 'Move stop to breakeven or better on remaining size.' });
  } else if (overall === 'TRAIL') {
    recommendedActions.push({ action: 'TRAIL_STOP', detail: 'Trail stop toward 1:2.5 floor and let runner work toward 1:4.' });
  } else if (overall === 'STRONG_HOLD') {
    recommendedActions.push({ action: 'MONITOR', detail: 'Position is well supported — stay disciplined on original plan.' });
  } else {
    recommendedActions.push({ action: 'MONITOR', detail: 'Continue monitoring key levels and conviction.' });
  }

  // Risk adjustment for the *existing* position
  let riskAdjustment: ManagementAdvice['riskAdjustment'] = { suggestedAction: 'MAINTAIN', notes: [] };
  if (momentumDecay >= 20 || conviction < thresholds.enter) {
    riskAdjustment = { suggestedAction: 'REDUCE_SIZE', notes: ['Reduce risk on the position due to weakening signals.'] };
  } else if (holdSuitability >= 80) {
    riskAdjustment = { suggestedAction: 'LET_RUN', notes: ['Conviction remains healthy for the held direction.'] };
  }

  // Dynamic stop suggestion from current structure (big management brain win)
  let suggestedStopAdjustment: ManagementAdvice['suggestedStopAdjustment'] | undefined;
  if (tradeSetup && priceData.levels) {
    const structureStop = heldDirection === 'CE-BUY' ? priceData.levels.support : priceData.levels.resistance;
    if (structureStop && Math.abs(structureStop - tradeSetup.stopLoss) > 3) {
      const better = heldDirection === 'CE-BUY' ? structureStop > tradeSetup.stopLoss : structureStop < tradeSetup.stopLoss;
      if (better) {
        suggestedStopAdjustment = {
          newStop: +structureStop.toFixed(2),
          reason: 'Current swing structure offers a tighter, more relevant stop than the original.',
          improvement: 'Tighter risk while still giving the trade room.',
        };
      }
    }
  }

  let rrTracker: PositionRrTracker | undefined;
  if (
    tradeSetup?.entry != null &&
    tradeSetup.stopLoss != null &&
    tradeSetup.risk > 0
  ) {
    const levels: PositionRrTrackerLevel[] = [
      {
        id: 'stop',
        label: 'Stop (−1R)',
        rr: -1,
        price: tradeSetup.stopLoss,
        kind: 'stop',
      },
      {
        id: 'entry',
        label: 'Entry',
        rr: 0,
        price: tradeSetup.entry,
        kind: 'entry',
      },
      {
        id: 'be',
        label: 'BE lock (~1R)',
        rr: 0.7,
        price: tradeSetup.entry,
        kind: 'be',
      },
    ];
    for (const tp of tradeSetup.takeProfits ?? []) {
      levels.push({
        id: String(tp.rr),
        label: String(tp.rr),
        rr: tp.multiplier ?? 1,
        price: tp.price,
        kind: 'tp',
      });
    }
    rrTracker = {
      direction: heldDirection,
      entry: tradeSetup.entry,
      stopLoss: tradeSetup.stopLoss,
      risk: tradeSetup.risk,
      spot: priceData.lastPrice,
      currentR,
      highestHitRr,
      levels,
    };
  }

  // Headline
  let headline = `Holding ${heldDirection} — `;
  if (overall === 'STRONG_HOLD') headline += 'strong alignment, manage for extension.';
  else if (overall === 'TRAIL') headline += '1:2+ reached — trail and manage runner.';
  else if (overall === 'PARTIAL_BOOK') headline += 'book partials and protect.';
  else if (overall === 'HARD_EXIT' || overall === 'EXIT_SOON') headline += 'reduce or exit — signals no longer supportive.';
  else headline += 'monitor key levels and conviction.';

  // === Position Health Score (the interesting new piece) ===
  const positionHealth = computePositionHealthScore(positionContext, decision, priceData, tradingStyle);

  // Use health to influence overall stance and actions (makes the brain smarter)
  if (positionHealth.score < 35 && !['HARD_EXIT', 'EXIT_SOON'].includes(overall)) {
    overall = 'EXIT_SOON';
    if (!reasons.some(r => r.includes('health'))) {
      reasons.push(`Position health is critically low (${positionHealth.score}).`);
    }
    recommendedActions.unshift({ action: 'BOOK_PARTIAL', detail: 'Health score in Exit Zone — book at least 50% immediately.' });
  } else if (positionHealth.score < 50 && overall === 'HOLD') {
    overall = 'CONFLICT';
    recommendedActions.unshift({ action: 'BOOK_PARTIAL', detail: 'Health below 50 — consider booking 30-50% to de-risk.' });
  }

  return {
    mode: 'MANAGEMENT',
    heldDirection,
    isMixedDirections,
    positionCount: count,
    overall,
    headline,
    reasons: reasons.length ? reasons : ['Current engine read evaluated against your live position.'],
    recommendedActions,
    currentR,
    highestHitRr,
    rrTracker,
    alignment,
    holdSuitability,
    riskAdjustment,
    suggestedStopAdjustment,
    positionHealth,
    source: 'live_position',
  };
}

let openPositionsFetchInFlight: Promise<OpenPositionMonitorContext[]> | null =
  null;

export function clearOpenPositionsCache(): void {
  clearLivePositionsCache();
  openPositionsFetchInFlight = null;
}

export { mapFyersPositionRowToMonitorContext };

function filterPositionsForWatch(
  positions: OpenPositionMonitorContext[],
  watchedIndexSymbols: string[],
): OpenPositionMonitorContext[] {
  const watched = new Set(watchedIndexSymbols);
  return positions.filter((position) => watched.has(position.indexSymbol));
}

async function fetchAllOpenIndexOptionPositions(
  fastify: FastifyInstance,
): Promise<OpenPositionMonitorContext[]> {
  try {
    const res = await fastify.fyers.get_positions();
    if (res.s !== ResponseStatus.ok || !res.netPositions?.length) return [];

    const contexts: OpenPositionMonitorContext[] = [];

    for (const row of res.netPositions) {
      const mapped = mapFyersPositionRowToMonitorContext({
        symbol: row.symbol,
        netQty: row.netQty,
        qty: row.qty,
        buyAvg: row.buyAvg,
        unrealized_profit: row.unrealized_profit,
        pl: row.pl,
      });
      if (mapped) contexts.push(mapped);
    }

    return contexts;
  } catch (err) {
    fastify.log?.warn?.({ err }, 'fetchOpenIndexOptionPositions failed');
    return [];
  }
}

export async function fetchOpenIndexOptionPositions(
  fastify: FastifyInstance,
  watchedIndexSymbols: string[],
  options?: { forceFresh?: boolean },
): Promise<OpenPositionMonitorContext[]> {
  const ttlMs = resolveOpenPositionsCacheTtlMs();
  const reconcileMs = resolveOpenPositionsRestReconcileMs();
  const now = Date.now();
  const forceFresh = options?.forceFresh === true;
  const snapshot = getOpenPositionsCacheSnapshot();

  if (!forceFresh && snapshot) {
    const cacheAge = now - snapshot.fetchedAt;
    if (isOpenPositionsWsLive() && cacheAge < reconcileMs) {
      return filterPositionsForWatch(snapshot.positions, watchedIndexSymbols);
    }
    if (!isOpenPositionsWsLive() && cacheAge < ttlMs) {
      return filterPositionsForWatch(snapshot.positions, watchedIndexSymbols);
    }
  }

  if (!forceFresh && openPositionsFetchInFlight) {
    const shared = await openPositionsFetchInFlight;
    return filterPositionsForWatch(shared, watchedIndexSymbols);
  }

  const fetchPromise = fetchAllOpenIndexOptionPositions(fastify);
  if (!forceFresh) {
    openPositionsFetchInFlight = fetchPromise;
  }

  try {
    const all = await fetchPromise;
    seedOpenPositionsCache(all, 'rest');
    return filterPositionsForWatch(all, watchedIndexSymbols);
  } finally {
    if (openPositionsFetchInFlight === fetchPromise) {
      openPositionsFetchInFlight = null;
    }
  }
}

/**
 * Robust wrapper around position fetching.
 * Always returns a context object even on errors.
 * Computes heldDirection only when there is exactly one unique direction.
 * Exposes isMixedDirections and fetch status for callers to decide how to degrade.
 */
export function buildOpenPositionContextFromPositions(
  positions: OpenPositionMonitorContext[],
): OpenPositionContext {
  const count = positions.length;
  if (count === 0) {
    return {
      positions: [],
      heldDirection: null,
      isMixedDirections: false,
      count: 0,
      fetchSucceeded: true,
    };
  }

  const directions = positions.map((p) => p.direction);
  const unique = [...new Set(directions)];
  const isMixed = unique.length > 1;
  const held = isMixed ? null : (unique[0] as HeldDirection);

  return {
    positions,
    heldDirection: held,
    isMixedDirections: isMixed,
    count,
    fetchSucceeded: true,
  };
}

export async function getOpenPositionContext(
  fastify: FastifyInstance,
  indexSymbols: string[],
): Promise<OpenPositionContext> {
  const empty: OpenPositionContext = {
    positions: [],
    heldDirection: null,
    isMixedDirections: false,
    count: 0,
    fetchSucceeded: false,
  };

  try {
    const positions = await fetchOpenIndexOptionPositions(fastify, indexSymbols);
    return buildOpenPositionContextFromPositions(positions);
  } catch (err: any) {
    const msg = err?.message || String(err);
    fastify.log?.warn?.({ err, symbols: indexSymbols }, 'getOpenPositionContext failed to fetch positions');
    return { ...empty, fetchError: msg };
  }
}

/** Convenience: true if there is at least one open leg for the index (regardless of mixed or tracking). */
export async function hasLiveOpenPosition(
  fastify: FastifyInstance,
  indexSymbol: string,
): Promise<boolean> {
  try {
    const ctx = await getOpenPositionContext(fastify, [indexSymbol]);
    return ctx.fetchSucceeded && ctx.count > 0;
  } catch {
    return false;
  }
}

/** Phase 2: Telegram TP alert polling — not wired in Phase 1. */
export async function evaluateOpenPositionTpAlerts(): Promise<{
  monitored: number;
  tracked: number;
  notified: number;
}> {
  return { monitored: 0, tracked: 0, notified: 0 };
}
