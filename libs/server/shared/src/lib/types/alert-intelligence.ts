import { AdaptiveConvictionInsight } from './adaptive-conviction.js';
import { ExactStrikeRecommendation } from './exact-strike-recommendation.js';
import { DecisionAction, TradeBias } from './trade-decision.js';
import { TradingStyle } from './trading-style.js';

export interface AlertWhyComponent {
  name: string;
  score: number;
  interpretation: string;
  humanExplanation: string;
}

export type AlertWhySource = 'alert' | 'poll' | 'live';

export interface AlertWhyContext {
  symbol: string;
  tradingStyle: TradingStyle;
  action: DecisionAction;
  bias: TradeBias;
  conviction: number;
  alertedAt: string;
  wasNotified?: boolean;
  source?: AlertWhySource;
  confluenceLines: string[];
  priceActionLines: string[];
  optionFlowLines: string[];
  vetoOrCaution: string[];
  tradeGuidanceNotes: string | null;
  humanSummary: string;
  adaptiveConviction?: AdaptiveConvictionInsight;
}

export interface SignalOutcomeRecord {
  key: string;
  symbol: string;
  tradingStyle: TradingStyle;
  action: 'CE-BUY' | 'PE-BUY';
  sessionDate: string;
  entryPrice: number;
  exitPrice?: number;
  status: 'open' | 'win' | 'loss' | 'flat';
  openedAt: Date;
  closedAt?: Date;
  convictionAtEntry: number;
  exactStrike?: ExactStrikeRecommendation;
  entrySpot?: number;
  optionSymbol?: string;
}