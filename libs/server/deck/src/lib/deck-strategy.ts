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
  priceActionStrategies?: DeckStrategyItem[];
  optionStrategies?: DeckStrategyItem[];
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

function classifyIvRegime(ivRegime?: string): 'high' | 'low' | 'normal' {
  const r = (ivRegime ?? '').toLowerCase();
  if (r.includes('expand') || r.includes('high') || r.includes('fear')) {
    return 'high';
  }
  if (r.includes('crush') || r.includes('low')) return 'low';
  return 'normal';
}

/**
 * Option-structure recommendations, distinct from the price-action structural
 * checklist. These answer "which option structure fits?" given direction,
 * conviction and — when an option overlay is fresh — the live IV regime and
 * option-flow bias. High IV favours defined-risk spreads (theta/vega aware);
 * low IV favours buying premium outright. When IV is unknown (PA-only), it
 * still returns sensible directional structures so the tab is never empty and
 * never identical to the PA tab.
 */
export function buildOptionRecommendedStrategies(
  action: string,
  conviction: number,
  ivRegime?: string,
  optionBias?: string,
): DeckStrategyItem[] {
  const iv = classifyIvRegime(ivRegime);
  const ivNote =
    iv === 'high'
      ? 'IV elevated — defined-risk spreads cut theta/vega bleed vs naked longs.'
      : iv === 'low'
        ? 'IV compressed — long premium is cheap; debit / long structures favored.'
        : 'IV in a normal band — standard sizing.';
  const flowNote =
    optionBias && optionBias.toLowerCase() !== 'neutral'
      ? ` Option-flow bias: ${optionBias}.`
      : '';
  const base = Math.max(20, Math.round(conviction));

  if (action === 'CE-BUY' || action === 'PE-BUY') {
    const bullish = action === 'CE-BUY';
    const longLeg = bullish ? 'Long CE (ATM / ITM)' : 'Long PE (ATM / ITM)';
    const spread = bullish ? 'Bull call debit spread' : 'Bear put debit spread';
    const longItem: DeckStrategyItem = {
      strategy: longLeg,
      confidenceScore: iv === 'high' ? Math.max(20, base - 18) : base,
      reason: `Directional ${bullish ? 'long call' : 'long put'}. ${ivNote}${flowNote}`,
      risk: iv === 'high' ? 'Full premium at risk; high theta/vega bleed' : 'Premium at risk',
      executionHint: 'Prefer liquid weekly expiry; check bid/ask spread before entry.',
    };
    const spreadItem: DeckStrategyItem = {
      strategy: spread,
      confidenceScore: iv === 'high' ? base : Math.max(20, base - 12),
      reason:
        iv === 'high'
          ? `Caps cost and vega in elevated IV while keeping ${bullish ? 'bullish' : 'bearish'} bias.`
          : 'Lower-cost defined-risk directional structure.',
      risk: 'Spread width caps max gain',
    };
    // In high IV, lead with the spread (cheaper, less decay); otherwise the long.
    return iv === 'high' ? [spreadItem, longItem] : [longItem, spreadItem];
  }

  // Neutral / no-trade
  if (iv === 'high') {
    return [
      {
        strategy: 'Iron condor',
        confidenceScore: 45,
        reason: `No directional edge with elevated IV — premium selling favored. ${ivNote}${flowNote}`,
        risk: 'Gap risk on indices; defined max loss',
      },
      {
        strategy: 'Short strangle (defined-risk)',
        confidenceScore: 35,
        reason: 'Range-bound expectation; collect rich premium with wings for protection.',
        risk: 'Assignment / gap risk — keep wings',
      },
    ];
  }
  return [
    {
      strategy: 'Wait for clearer setup',
      confidenceScore: 40,
      reason: `No directional edge. ${ivNote}${flowNote}`,
    },
    {
      strategy: 'Long straddle (only on expected expansion)',
      confidenceScore: 30,
      reason: 'Cheap premium can favor long volatility if a breakout is expected.',
      risk: 'Theta decay if range persists',
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
  const optionStrategies = (decision.recommendedStrategies ?? [])
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
  const priceActionStrategies = buildPaRecommendedStrategies(
    decision.action,
    decision.conviction,
  );

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
    strategies: optionStrategies,
    priceActionStrategies,
    optionStrategies,
    replayNote: opts?.replayNote,
  };
}