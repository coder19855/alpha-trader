import { OptionSide } from '../../core/models/option-chain.models';

/** Premium change per unit (₹/share) at a given index move using δ + ½γ. */
export function optionPremiumChangeAtMove(
  movePts: number,
  signedDelta: number,
  gamma: number | null,
): number {
  const g = gamma ?? 0;
  return signedDelta * movePts + 0.5 * g * movePts * movePts;
}

/** Total option P&L (₹) for `lots` at `movePts` from spot. */
export function optionPnlAtMove(
  movePts: number,
  lotSize: number,
  lots: number,
  signedDelta: number,
  gamma: number | null,
): number {
  return optionPremiumChangeAtMove(movePts, signedDelta, gamma) * lotSize * lots;
}

/** Long buyer signed delta — puts use negative delta so down-moves profit. */
export function signedOptionDelta(
  delta: number | null,
  side: OptionSide,
): number | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  return side === 'PE' ? -Math.abs(delta) : Math.abs(delta);
}

/**
 * Index points spot must move for total option P&L to reach `targetPnlTotal`.
 * Picks the smallest |move| root of the quadratic (fixes large-root bug on losses).
 */
export function solveIndexMoveForTargetPnl(
  targetPnlTotal: number,
  lotSize: number,
  lots: number,
  delta: number | null,
  gamma: number | null,
  side: OptionSide,
): number | null {
  if (!lotSize || lotSize <= 0 || !lots || lots <= 0) return null;
  if (targetPnlTotal === 0) return 0;

  const signedDelta = signedOptionDelta(delta, side);
  if (signedDelta == null || Math.abs(signedDelta) < 1e-6) return null;

  const premiumChangeTarget = targetPnlTotal / (lotSize * lots);
  const g = gamma ?? 0;

  if (Math.abs(g) < 1e-9) {
    return premiumChangeTarget / signedDelta;
  }

  const disc = signedDelta * signedDelta + 2 * g * premiumChangeTarget;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  const roots = [
    (-signedDelta + sqrtDisc) / g,
    (-signedDelta - sqrtDisc) / g,
  ].filter((r) => Number.isFinite(r));

  if (!roots.length) return null;

  return roots.reduce((best, r) => (Math.abs(r) < Math.abs(best) ? r : best));
}

export function formatIndexMove(pts: number | null, side: OptionSide): string {
  if (pts == null) return '—';
  if (Math.abs(pts) < 0.05) return '0 pts';
  const rounded = Math.abs(pts) >= 10 ? Math.round(pts) : +pts.toFixed(1);
  const dir =
    pts > 0 ? 'up' : pts < 0 ? 'down' : 'flat';
  const arrow = pts > 0 ? '+' : '';
  return `${arrow}${rounded} pts (${dir})`;
}