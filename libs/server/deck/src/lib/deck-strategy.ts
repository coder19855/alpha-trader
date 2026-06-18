import { TradingStyle, getStyleScoringConfig } from '@alpha-trader/server-shared';

export interface DeckStrategyItem {
  strategy: string;
  risk?: string;
  confidenceScore: number;
  reason: string;
  executionHint?: string;
}

export interface DeckStrategyPayload {
  action: string;
  bias: string;
  conviction: number;
  recommendation: string;
  humanSummary: string;
  tradeGuidance: {
    shouldConsiderTrade: boolean;
    sizeRecommendation: string;
    notes: string;
    thresholds?: { enter: number; strong: number; cautionBelow: number };
    scoringWeights?: { priceAction: number; optionFlow: number };
  };
  riskNotes?: string[];
  suggestedRiskPercent?: number;
  strategies: DeckStrategyItem[];
  replayNote?: string;
}

type DecisionLike = {
  action: string;
  bias: string;
  conviction: number;
  recommendation?: string;
  humanSummary?: string;
  tradeGuidance?: {
    shouldConsiderTrade?: boolean;
    sizeRecommendation?: string;
    notes?: string;
    thresholdsForThisStyle?: {
      enter: number;
      strong: number;
      cautionBelow: number;
    };
    scoringWeights?: { priceAction: number; optionFlow: number };
  };
  risk?: { suggestedRiskPercent?: number; notes?: string[] };
  recommendedStrategies?: Array<{
    strategy?: string;
    risk?: string;
    confidenceScore?: number;
    reason?: string;
    executionHint?: string;
  }>;
};

export function buildPaRecommendedStrategies(
  action: string,
  conviction: number,
): DeckStrategyItem[] {
  if (action === 'CE-BUY') {
    return [
      {
        strategy: 'Long CE (ATM / ITM)',
        confidenceScore: conviction,
        reason: 'Bullish price-action signal — directional long call.',
        risk: 'Premium at risk',
        executionHint: 'Prefer liquid weekly expiry; size to 1% risk.',
      },
      {
        strategy: 'Bull call spread',
        confidenceScore: Math.max(20, conviction - 12),
        reason: 'Lower-cost bullish expression with capped upside.',
        risk: 'Spread width caps max gain',
      },
    ];
  }
  if (action === 'PE-BUY') {
    return [
      {
        strategy: 'Long PE (ATM / ITM)',
        confidenceScore: conviction,
        reason: 'Bearish price-action signal — directional long put.',
        risk: 'Premium at risk',
        executionHint: 'Prefer liquid weekly expiry; size to 1% risk.',
      },
      {
        strategy: 'Bear put spread',
        confidenceScore: Math.max(20, conviction - 12),
        reason: 'Defined-risk bearish structure.',
        risk: 'Spread width caps max gain',
      },
    ];
  }
  return [
    {
      strategy: 'Wait for clearer setup',
      confidenceScore: 40,
      reason: 'No directional edge — avoid fresh risk until conviction improves.',
    },
    {
      strategy: 'Neutral / range structures',
      confidenceScore: 35,
      reason: 'Iron condor or butterfly if IV supports premium selling.',
      risk: 'Gap risk on indices',
    },
  ];
}

export function buildTradeGuidanceForPa(
  conviction: number,
  style: TradingStyle,
  action: string,
): {
  shouldConsiderTrade: boolean;
  sizeRecommendation: string;
  notes: string;
  thresholdsForThisStyle: {
    enter: number;
    strong: number;
    cautionBelow: number;
  };
  scoringWeights: { priceAction: number; optionFlow: number };
} {
  const thresholds = getStyleScoringConfig(style).convictionThreshold;
  const directional = action === 'CE-BUY' || action === 'PE-BUY';
  let sizeRecommendation = 'Stand aside — conviction below entry threshold.';
  if (directional && conviction >= thresholds.strong) {
    sizeRecommendation = 'Full tactical size within your risk budget.';
  } else if (directional && conviction >= thresholds.enter) {
    sizeRecommendation = 'Reduced size — moderate conviction.';
  } else if (directional) {
    sizeRecommendation = 'Probe only — weak conviction.';
  }

  return {
    shouldConsiderTrade: directional && conviction >= thresholds.enter,
    sizeRecommendation,
    notes: directional
      ? 'PA-only mode — validate structure on Chart tab before entry.'
      : 'No trade bias — manage existing positions or wait.',
    thresholdsForThisStyle: {
      enter: thresholds.enter,
      strong: thresholds.strong,
      cautionBelow: thresholds.medium,
    },
    scoringWeights: { priceAction: 1, optionFlow: 0 },
  };
}

export function extractDeckStrategyPayload(
  decision: DecisionLike,
  opts?: { replayNote?: string },
): DeckStrategyPayload {
  const guidance = decision.tradeGuidance ?? {};
  const strategies = (decision.recommendedStrategies ?? [])
    .map((strat, index) => ({
      strategy: String(strat.strategy ?? 'Strategy'),
      risk: strat.risk ? String(strat.risk) : undefined,
      confidenceScore: Number.isFinite(strat.confidenceScore)
        ? Number(strat.confidenceScore)
        : Math.max(20, 75 - index * 12),
      reason:
        strat.reason?.trim() ||
        'Selected based on current price-action regime and trading style.',
      executionHint: strat.executionHint?.trim() || undefined,
    }))
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  return {
    action: decision.action,
    bias: decision.bias,
    conviction: decision.conviction,
    recommendation: String(decision.recommendation ?? ''),
    humanSummary: String(decision.humanSummary ?? ''),
    tradeGuidance: {
      shouldConsiderTrade: Boolean(guidance.shouldConsiderTrade),
      sizeRecommendation: String(
        guidance.sizeRecommendation ?? 'Review conviction before sizing.',
      ),
      notes: String(guidance.notes ?? ''),
      thresholds: guidance.thresholdsForThisStyle,
      scoringWeights: guidance.scoringWeights,
    },
    riskNotes: decision.risk?.notes,
    suggestedRiskPercent: decision.risk?.suggestedRiskPercent,
    strategies,
    replayNote: opts?.replayNote,
  };
}