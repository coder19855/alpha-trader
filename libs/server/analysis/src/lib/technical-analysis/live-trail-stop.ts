import { TradeAction, TradeOutcome, TradeSetup } from '@alpha-trader/server-shared';
import {
  BenchmarkExitPolicy,
  ChandelierState,
  isChandelierActive,
  tighterStopPrice,
} from './chandelier-exit.js';
import {
  StructureTrailState,
  isStructureTrailActive,
} from './structure-trail-exit.js';
import {
  floorPriceFromR,
  formatTrailFloorHitLevel,
  resolveTrailFloorR,
} from './trailing-tp-policy.js';

export function exitRAtPrice(
  action: TradeAction,
  entry: number,
  risk: number,
  price: number,
): number {
  if (risk <= 0) return 0;
  return +(
    (action === 'CE-BUY' ? price - entry : entry - price) / risk
  ).toFixed(3);
}

export interface ResolvedTrailStop {
  stopPrice: number;
  hitLevel: NonNullable<TradeOutcome['hitLevel']>;
  exitR: number;
  trailFloorR: number | null;
  trailFloorPrice: number | null;
}

export function resolveTrailStop(
  action: TradeAction,
  setup: TradeSetup,
  peakR: number,
  chandelier: ChandelierState | null,
  structure: StructureTrailState | null,
  exitPolicy: BenchmarkExitPolicy,
  hybridMinPeakR: number,
): ResolvedTrailStop | null {
  const rrFloorR = resolveTrailFloorR(peakR);
  const rrFloorPrice =
    rrFloorR != null
      ? floorPriceFromR(action, setup.entry, setup.risk, rrFloorR)
      : null;
  const chandelierStop = chandelier?.stopPrice ?? null;
  const chandelierActive =
    chandelierStop != null &&
    isChandelierActive(action, chandelierStop, setup.stopLoss);
  const structureStop = structure?.stopPrice ?? null;
  const structureActive =
    structureStop != null &&
    isStructureTrailActive(action, structureStop, setup.stopLoss);

  const pickAltStop = (
    altStop: number | null,
    altActive: boolean,
    altHit: NonNullable<TradeOutcome['hitLevel']>,
  ): ResolvedTrailStop | null => {
    if (peakR < hybridMinPeakR) {
      if (rrFloorPrice == null || rrFloorR == null) return null;
      return {
        stopPrice: rrFloorPrice,
        hitLevel: formatTrailFloorHitLevel(rrFloorR),
        exitR: rrFloorR,
        trailFloorR: rrFloorR,
        trailFloorPrice: rrFloorPrice,
      };
    }
    const blended = tighterStopPrice(action, rrFloorPrice, altActive ? altStop : null);
    if (blended == null) return null;
    const altWins =
      altActive &&
      altStop != null &&
      blended === altStop &&
      (rrFloorPrice == null ||
        (action === 'CE-BUY' ? altStop > rrFloorPrice : altStop < rrFloorPrice));
    return {
      stopPrice: blended,
      hitLevel: altWins ? altHit : formatTrailFloorHitLevel(rrFloorR ?? 0),
      exitR: altWins
        ? exitRAtPrice(action, setup.entry, setup.risk, blended)
        : (rrFloorR ?? 0),
      trailFloorR: rrFloorR,
      trailFloorPrice: rrFloorPrice,
    };
  };

  if (
    exitPolicy === 'rr-ladder' ||
    exitPolicy === 'partial-scale-50' ||
    exitPolicy === 'momentum-decay-exit'
  ) {
    if (rrFloorPrice == null || rrFloorR == null) return null;
    return {
      stopPrice: rrFloorPrice,
      hitLevel: formatTrailFloorHitLevel(rrFloorR),
      exitR: rrFloorR,
      trailFloorR: rrFloorR,
      trailFloorPrice: rrFloorPrice,
    };
  }

  if (exitPolicy === 'chandelier' || exitPolicy === 'atr-tighten') {
    if (!chandelierActive || chandelierStop == null) return null;
    return {
      stopPrice: chandelierStop,
      hitLevel: exitPolicy === 'atr-tighten' ? 'ATR_TIGHTEN' : 'CHANDELIER',
      exitR: exitRAtPrice(action, setup.entry, setup.risk, chandelierStop),
      trailFloorR: rrFloorR,
      trailFloorPrice: rrFloorPrice,
    };
  }

  if (exitPolicy === 'chandelier-hybrid') {
    if (!chandelierActive || chandelierStop == null) {
      if (rrFloorPrice == null || rrFloorR == null) return null;
      return {
        stopPrice: rrFloorPrice,
        hitLevel: formatTrailFloorHitLevel(rrFloorR),
        exitR: rrFloorR,
        trailFloorR: rrFloorR,
        trailFloorPrice: rrFloorPrice,
      };
    }
    return pickAltStop(chandelierStop, true, 'CHANDELIER');
  }

  if (exitPolicy === 'structure-trail') {
    return pickAltStop(structureStop, structureActive, 'STRUCTURE_TRAIL');
  }

  return null;
}