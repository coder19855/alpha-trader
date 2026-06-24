import { TradingStyle } from '../models/deck.models';

const BLEND_WEIGHTS: Record<
  TradingStyle,
  { priceAction: number; optionFlow: number }
> = {
  SCALPER: { priceAction: 0.85, optionFlow: 0.15 },
  INTRADAY: { priceAction: 0.65, optionFlow: 0.35 },
  POSITIONAL: { priceAction: 0.35, optionFlow: 0.65 },
};

export interface BlendLaneDisplay {
  paPercent: number;
  optionPercent: number;
  combinedPercent: number;
  hasOptionFlow: boolean;
}

export function computeBlendLanes(params: {
  style: TradingStyle | string;
  paPercent: number;
  optionPercent: number | null | undefined;
}): BlendLaneDisplay {
  const style = String(params.style || 'INTRADAY').toUpperCase() as TradingStyle;
  const weights = BLEND_WEIGHTS[style] ?? BLEND_WEIGHTS.INTRADAY;
  const pa = Math.round(Math.max(0, Math.min(100, params.paPercent)));
  const option =
    params.optionPercent == null || !Number.isFinite(params.optionPercent)
      ? 0
      : Math.round(Math.max(0, Math.min(100, params.optionPercent)));
  const combined = Math.round(
    Math.max(0, Math.min(100, pa * weights.priceAction + option * weights.optionFlow)),
  );
  return {
    paPercent: pa,
    optionPercent: option,
    combinedPercent: combined,
    hasOptionFlow: params.optionPercent != null && Number.isFinite(params.optionPercent),
  };
}