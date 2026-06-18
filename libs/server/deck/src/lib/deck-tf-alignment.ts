import { PriceActionResponse } from '@alpha-trader/server-shared';

export type DeckAlignmentDecision = {
  _debug?: { rawPrice?: PriceActionResponse };
  priceAction?: {
    components?: { alignment?: { score?: number } };
    confluence?: { aligned?: number };
  };
};

/** Single source for TF alignment count across Components, Veto, status line, and regime. */
export function resolveDeckAlignmentCount(decision: DeckAlignmentDecision): number {
  const fromRaw = decision._debug?.rawPrice?.confluence?.aligned;
  if (fromRaw != null && Number.isFinite(fromRaw)) {
    return Math.round(fromRaw);
  }

  const fromComponents = decision.priceAction?.components?.alignment?.score;
  if (fromComponents != null && Number.isFinite(fromComponents)) {
    return Math.round(fromComponents);
  }

  const legacy = decision.priceAction?.confluence?.aligned;
  if (legacy != null && Number.isFinite(legacy)) {
    return Math.round(legacy);
  }

  return 0;
}