import type { GreeksMoneyness } from './greeks-strike-insight.js';
import type { IndicatorScores } from './options.js';

export type OptionPaAlignment = 'confirm' | 'veto' | 'neutral' | 'skipped';

export interface OptionChainGuardLevel {
  strike: number;
  type: 'CE' | 'PE';
  oi: number;
  oiChange: number;
  ltp: number;
  iv: number | null;
  strength: number;
}

export interface AtmLegSnapshot {
  strike: number;
  ltp: number;
  oi: number;
  oiChange: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
}

export interface OptionChainAtmGreeks {
  atmStrike: number;
  ce: AtmLegSnapshot | null;
  pe: AtmLegSnapshot | null;
  /** Put IV minus call IV at ATM (positive = put skew). */
  ivSkew: number | null;
}

export interface OptionChainGuardData {
  spotLtp: number;
  atmStrike: number;
  maxPain: number;
  pcr: number;
  callOiTotal: number;
  putOiTotal: number;
  supportStrike: number | null;
  resistanceStrike: number | null;
  intradaySupport: number | null;
  intradayResistance: number | null;
  indiaVix: number;
  levels: OptionChainGuardLevel[];
}

export interface OptionChainComponentRow {
  id: string;
  name: string;
  score: number;
  interpretation?: string;
  weightage?: number;
  humanExplanation?: string;
}

export interface OptionChainSignalResponse {
  fetchedAt: string;
  cached: boolean;
  symbol: string;
  tradingStyle: string;
  score: number;
  signal: string;
  bias: string;
  ivRegime: string;
  conviction: number;
  confidence?: { percent: number };
  components: IndicatorScores;
  componentRows: OptionChainComponentRow[];
  guard: OptionChainGuardData;
  atmGreeks: OptionChainAtmGreeks;
  paAlignment: OptionPaAlignment;
  paAlignmentDetail: string;
  moneyness?: GreeksMoneyness;
  estRiskPerLot?: number | null;
  optionPremium?: number | null;
  optionDelta?: number | null;
}