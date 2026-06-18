import { GreeksMoneyness } from './greeks-strike-insight.js';

export interface ExactStrikeRecommendation {
  fyersSymbol: string;
  strike: number;
  moneyness: GreeksMoneyness;
  premium: number;
  delta: number | null;
  lotSize: number;
  indexLabel: string;
  expectedPremiumMove50Pts: number | null;
  rationale: string;
}

export interface ExactStrikeRecommendationPair {
  CE: ExactStrikeRecommendation | null;
  PE: ExactStrikeRecommendation | null;
}