import { DeckComponentGauge } from './deck.models';

export type OptionPaAlignment = 'confirm' | 'veto' | 'neutral' | 'skipped';
export type OptionMoneyness = 'ATM' | 'OTM' | 'ITM';
export type OptionSide = 'CE' | 'PE';

export interface OptionChainGuardLevel {
  strike: number;
  type: 'CE' | 'PE';
  oi: number;
  oiChange: number;
  ltp: number;
  ltpChange: number;
  ltpChangePct: number;
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

export interface OptionChainSignalPayload {
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
  componentRows: Array<{
    id: string;
    name: string;
    score: number;
    interpretation?: string;
    weightage?: number;
    humanExplanation?: string;
  }>;
  guard: OptionChainGuardData;
  atmGreeks?: OptionChainAtmGreeks;
  paAlignment: OptionPaAlignment;
  paAlignmentDetail: string;
  moneyness?: string;
  optionSide?: OptionSide;
  estRiskPerLot?: number | null;
  optionPremium?: number | null;
  optionStrike?: number | null;
  optionDelta?: number | null;
  optionGamma?: number | null;
  optionTheta?: number | null;
  optionVega?: number | null;
}

export function toOptionComponentGauges(
  rows: OptionChainSignalPayload['componentRows'],
): DeckComponentGauge[] {
  const labels: Record<string, string> = {
    oi: 'Open interest',
    pcr: 'PCR',
    iv: 'Implied vol',
    greeks: 'Greeks',
    trend: 'Trend',
    pain: 'Max pain',
    vix: 'VIX',
    skew: 'Skew',
  };
  const order = ['oi', 'trend', 'greeks', 'iv', 'pcr', 'pain', 'vix', 'skew'];
  const byId = new Map<string, DeckComponentGauge>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      label: labels[row.id] ?? row.name,
      value: Math.max(-1, Math.min(1, row.score)),
      weight: row.weightage,
      interpretation: row.humanExplanation ?? row.interpretation,
      group: 'option',
    });
  }
  const ordered: DeckComponentGauge[] = [];
  for (const id of order) {
    const g = byId.get(id);
    if (g) ordered.push(g);
  }
  for (const [id, g] of byId) {
    if (!order.includes(id)) ordered.push(g);
  }
  return ordered;
}