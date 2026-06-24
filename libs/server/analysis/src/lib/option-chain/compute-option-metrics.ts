import { FyersAPI } from 'fyers-api-v3';
import type { Explanation, ScoreComponents } from '../plugin-types.js';
import {
  Focus,
  GreeksMoneyness,
  TradeSignal,
  TradingStyle,
  resolvePaAlignment,
} from '@alpha-trader/server-shared';

export { resolvePaAlignment };

export interface OptionMetricsComputeInput {
  chain: FyersAPI.OptionChainData[];
  spotLtp: number;
  spotLtpChangePercent: number;
  indiaVix: number;
  tradingStyle: TradingStyle;
  supportResistance?: {
    overallSupport: number | null;
    overallResistance: number | null;
    intradaySupport: number | null;
    intradayResistance: number | null;
  };
  utils: Record<string, (...args: any[]) => any>;
  moneyness?: GreeksMoneyness;
  optionSide?: 'CE' | 'PE';
}

export interface ComputedOptionMetrics {
  score: number;
  signal: TradeSignal;
  bias: string;
  ivRegime: string;
  conviction: number;
  confidence: { percent: number };
  components: ScoreComponents;
  explanations: Record<string, Explanation>;
  atmStrike: number;
  maxPain: number;
  pcr: number;
  callOiTotal: number;
  putOiTotal: number;
  guardLevels: Array<{
    strike: number;
    type: 'CE' | 'PE';
    oi: number;
    oiChange: number;
    ltp: number;
    ltpChange: number;
    ltpChangePct: number;
    iv: number | null;
    strength: number;
  }>;
  atmGreeks: {
    atmStrike: number;
    ce: {
      strike: number;
      ltp: number;
      oi: number;
      oiChange: number;
      delta: number | null;
      gamma: number | null;
      theta: number | null;
      vega: number | null;
      iv: number | null;
    } | null;
    pe: {
      strike: number;
      ltp: number;
      oi: number;
      oiChange: number;
      delta: number | null;
      gamma: number | null;
      theta: number | null;
      vega: number | null;
      iv: number | null;
    } | null;
    ivSkew: number | null;
  };
  optionPremium: number | null;
  optionStrike: number | null;
  optionDelta: number | null;
  optionGamma: number | null;
  optionTheta: number | null;
  optionVega: number | null;
  optionSide: 'CE' | 'PE' | null;
}

function legSnapshot(row: FyersAPI.OptionChainData | null | undefined) {
  if (!row) return null;
  const g = row.greeks;
  return {
    strike: row.strike_price,
    ltp: row.ltp ?? 0,
    oi: row.oi ?? 0,
    oiChange: row.oich ?? 0,
    delta: g?.delta ?? null,
    gamma: g?.gamma ?? null,
    theta: g?.theta ?? null,
    vega: g?.vega ?? null,
    iv: g?.iv ?? null,
  };
}

function clampScore(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function findAtmStrike(chain: FyersAPI.OptionChainData[], spot: number): number {
  const strikes = [...new Set(chain.map((r) => r.strike_price))].sort(
    (a, b) => a - b,
  );
  if (!strikes.length) return Math.round(spot / 50) * 50;
  return strikes.reduce((best, s) =>
    Math.abs(s - spot) < Math.abs(best - spot) ? s : best,
  );
}

function rowsNearStrike(
  chain: FyersAPI.OptionChainData[],
  atm: number,
  span = 4,
): FyersAPI.OptionChainData[] {
  const step = atm >= 40000 ? 100 : atm >= 10000 ? 50 : 25;
  const min = atm - span * step;
  const max = atm + span * step;
  return chain.filter((r) => r.strike_price >= min && r.strike_price <= max);
}

function computeMaxPain(chain: FyersAPI.OptionChainData[]): number {
  const strikes = [...new Set(chain.map((r) => r.strike_price))].sort(
    (a, b) => a - b,
  );
  if (!strikes.length) return 0;

  let bestStrike = strikes[0];
  let bestPain = Number.POSITIVE_INFINITY;

  for (const test of strikes) {
    let pain = 0;
    for (const row of chain) {
      const strike = row.strike_price;
      const oi = row.oi || 0;
      if (row.option_type === 'CE') {
        pain += Math.max(0, test - strike) * oi;
      } else {
        pain += Math.max(0, strike - test) * oi;
      }
    }
    if (pain < bestPain) {
      bestPain = pain;
      bestStrike = test;
    }
  }
  return bestStrike;
}

function pickStrikeByMoneyness(
  chain: FyersAPI.OptionChainData[],
  spot: number,
  atm: number,
  moneyness: GreeksMoneyness,
  side: 'CE' | 'PE',
): FyersAPI.OptionChainData | null {
  const rows = chain.filter((r) => r.option_type === side);
  if (!rows.length) return null;
  const step = atm >= 40000 ? 100 : atm >= 10000 ? 50 : 25;

  if (moneyness === 'ATM') {
    return (
      rows.find((r) => r.strike_price === atm) ??
      rows.reduce((a, b) =>
        Math.abs(b.strike_price - spot) < Math.abs(a.strike_price - spot)
          ? b
          : a,
      )
    );
  }

  const target =
    side === 'CE'
      ? moneyness === 'OTM'
        ? atm + step
        : atm - step
      : moneyness === 'OTM'
        ? atm - step
        : atm + step;

  return rows.reduce((a, b) =>
    Math.abs(b.strike_price - target) < Math.abs(a.strike_price - target)
      ? b
      : a,
  );
}

function scoreOiPressure(near: FyersAPI.OptionChainData[]): number {
  let callBuild = 0;
  let putBuild = 0;
  for (const row of near) {
    const ch = row.oich || 0;
    if (row.option_type === 'CE') callBuild += ch;
    else putBuild += ch;
  }
  const total = Math.abs(callBuild) + Math.abs(putBuild);
  if (total < 1) return 0;
  return clampScore((callBuild - putBuild) / total);
}

function scorePcr(callOi: number, putOi: number): number {
  if (callOi <= 0) return 0;
  const pcr = putOi / callOi;
  // Index chains often sit 0.9–1.2 structurally — treat as neutral.
  if (pcr >= 0.9 && pcr <= 1.15) return 0;
  if (pcr > 1.35) return clampScore(-(pcr - 1.15) / 0.8);
  if (pcr > 1.15) return clampScore(-((pcr - 1.15) / 0.4) * 0.35);
  if (pcr < 0.75) return clampScore((0.9 - pcr) / 0.5);
  if (pcr < 0.9) return clampScore(((0.9 - pcr) / 0.15) * 0.35);
  return 0;
}

function scorePain(spot: number, maxPain: number): number {
  if (!maxPain) return 0;
  const distPct = ((spot - maxPain) / spot) * 100;
  return clampScore(-distPct / 0.8);
}

function scoreSkew(atmCall: FyersAPI.OptionChainData | null, atmPut: FyersAPI.OptionChainData | null): number | null {
  const callIv = atmCall?.greeks?.iv;
  const putIv = atmPut?.greeks?.iv;
  if (callIv == null || putIv == null) return null;
  const skew = putIv - callIv;
  return clampScore(-skew / 8);
}

function scoreIv(atmIv: number | null | undefined): number | null {
  if (atmIv == null || !Number.isFinite(atmIv)) return null;
  if (atmIv < 12) return 0.55;
  if (atmIv < 16) return 0.2;
  if (atmIv < 22) return 0;
  if (atmIv < 28) return -0.35;
  return -0.7;
}

function scoreVix(vix: number, norm: (x: number, scale?: number) => number): number {
  if (!Number.isFinite(vix) || vix <= 0) return 0;
  const mid = 16;
  return clampScore(-norm(vix - mid, 8));
}

function scoreGreeks(near: FyersAPI.OptionChainData[]): number | null {
  let netDelta = 0;
  let weight = 0;
  for (const row of near) {
    const delta = row.greeks?.delta;
    if (delta == null) continue;
    const signed = row.option_type === 'PE' ? -Math.abs(delta) : Math.abs(delta);
    const w = Math.max(1, row.oi || 1);
    netDelta += signed * w;
    weight += w;
  }
  if (weight <= 0) return null;
  return clampScore(netDelta / weight / 0.45);
}

function scoreSpotMomentum(changePct: number): number {
  if (!Number.isFinite(changePct) || Math.abs(changePct) < 0.08) return 0;
  return clampScore(changePct / 0.4);
}

function scoreOiTrend(near: FyersAPI.OptionChainData[]): number {
  let bullish = 0;
  let bearish = 0;
  for (const row of near) {
    const ch = row.oich || 0;
    if (row.option_type === 'CE') {
      if (ch > 0) bullish += ch;
      else bearish += Math.abs(ch);
    } else {
      if (ch > 0) bearish += ch;
      else bullish += Math.abs(ch);
    }
  }
  const total = bullish + bearish;
  if (total < 1) return 0;
  return clampScore((bullish - bearish) / total);
}

function scoreTrend(
  near: FyersAPI.OptionChainData[],
  spotChangePct: number,
): number {
  const oiTrend = scoreOiTrend(near);
  const spot = scoreSpotMomentum(spotChangePct);
  if (spot === 0) return oiTrend;
  return clampScore(oiTrend * 0.65 + spot * 0.35);
}

export function computeOptionMetricsFromChain(
  input: OptionMetricsComputeInput,
): ComputedOptionMetrics {
  const { chain, spotLtp, indiaVix, tradingStyle, utils, moneyness, optionSide } =
    input;
  const atmStrike = findAtmStrike(chain, spotLtp);
  const near = rowsNearStrike(chain, atmStrike);
  const atmCall = near.find(
    (r) => r.option_type === 'CE' && r.strike_price === atmStrike,
  );
  const atmPut = near.find(
    (r) => r.option_type === 'PE' && r.strike_price === atmStrike,
  );

  const callOiTotal = chain
    .filter((r) => r.option_type === 'CE')
    .reduce((s, r) => s + (r.oi || 0), 0);
  const putOiTotal = chain
    .filter((r) => r.option_type === 'PE')
    .reduce((s, r) => s + (r.oi || 0), 0);
  const pcrRaw = callOiTotal > 0 ? putOiTotal / callOiTotal : 1;
  const maxPain = computeMaxPain(chain);

  const oi = scoreOiPressure(near);
  const pcr = scorePcr(callOiTotal, putOiTotal);
  const skew = scoreSkew(atmCall ?? null, atmPut ?? null);
  const iv = scoreIv(atmCall?.greeks?.iv ?? atmPut?.greeks?.iv);
  const pain = scorePain(spotLtp, maxPain);
  const greeks = scoreGreeks(near);
  const vix = scoreVix(indiaVix, utils.norm);
  const trend = scoreTrend(near, input.spotLtpChangePercent);

  const parts: ScoreComponents = {
    oi,
    pcr,
    skew,
    iv,
    pain,
    greeks,
    vix,
    trend,
  };

  const weights = utils.getScoreWeights(tradingStyle) as Record<
    keyof ScoreComponents,
    number
  >;
  const explanations: Record<string, Explanation> = {};

  const addExplanation = (
    key: keyof ScoreComponents,
    name: string,
    score: number | null,
    interpretation: string,
    focus: Focus = Focus.Intraday,
  ) => {
    explanations[key] = {
      name,
      score,
      interpretation,
      meaning: interpretation,
      weightage: weights[key],
      focus,
    };
  };

  addExplanation('oi', 'OI Pressure Score', oi, utils.interpretRange(oi));
  addExplanation('pcr', 'PCR Score', pcr, utils.interpretRange(pcr), Focus.Overall);
  addExplanation(
    'skew',
    'IV Skew Score',
    skew,
    skew == null ? 'Insufficient IV skew data' : utils.interpretRange(skew),
    Focus.Overall,
  );
  addExplanation(
    'iv',
    'ATM IV Score',
    iv,
    iv == null ? 'IV data unavailable' : utils.interpretIVRange(iv),
  );
  addExplanation(
    'pain',
    'Max Pain Score',
    pain,
    `Spot ${spotLtp.toFixed(0)} vs max pain ${maxPain} (PCR ${pcrRaw.toFixed(2)})`,
    Focus.Overall,
  );
  addExplanation(
    'greeks',
    'Greeks Composite Score',
    greeks,
    greeks == null ? 'Greeks unavailable' : utils.interpretRange(greeks),
  );
  addExplanation(
    'vix',
    'India VIX Score',
    vix,
    utils.interpretVixRange(indiaVix || 0),
    Focus.Overall,
  );
  addExplanation('trend', 'Trend Confirmation Score', trend, utils.interpretRange(trend));

  const score = utils.calcFinalScore(parts, tradingStyle) as number;
  const signal = utils.mapSignal(score, tradingStyle) as TradeSignal;
  const ivRegime = utils.detectIvRegime(iv ?? 0, vix, skew ?? 0) as string;
  const confidence = utils.computeConfidence(explanations, signal) as {
    percent: number;
  };

  const bias =
    signal === TradeSignal.BullishTrade
      ? score >= 45
        ? 'Strong Bullish'
        : 'Moderate Bullish'
      : signal === TradeSignal.BearishTrade
        ? score <= -45
          ? 'Strong Bearish'
          : 'Moderate Bearish'
        : 'Neutral';

  const conviction = Math.min(
    95,
    Math.max(0, Math.round((Math.abs(score) / 100) * 70 + confidence.percent * 0.25)),
  );

  const maxOi = Math.max(
    1,
    ...near.map((r) => r.oi || 0),
  );
  const guardLevels = [...near]
    .sort((a, b) => (b.oi || 0) - (a.oi || 0))
    .slice(0, 12)
    .map((r) => ({
      strike: r.strike_price,
      type: (r.option_type === 'PE' ? 'PE' : 'CE') as 'CE' | 'PE',
      oi: r.oi || 0,
      oiChange: r.oich || 0,
      ltp: r.ltp || 0,
      ltpChange: r.ltpch ?? 0,
      ltpChangePct: r.ltpchp ?? 0,
      iv: r.greeks?.iv ?? null,
      strength: Math.min(1, (r.oi || 0) / maxOi),
    }));

  let optionPremium: number | null = null;
  let optionStrike: number | null = null;
  let optionDelta: number | null = null;
  let optionGamma: number | null = null;
  let optionTheta: number | null = null;
  let optionVega: number | null = null;
  let selectedSide: 'CE' | 'PE' | null = null;
  if (moneyness) {
    const side = optionSide ?? 'CE';
    const ref = pickStrikeByMoneyness(chain, spotLtp, atmStrike, moneyness, side);
    if (ref) {
      selectedSide = side;
      optionStrike = ref.strike_price;
      optionPremium = ref.ltp ?? null;
      optionDelta = ref.greeks?.delta ?? null;
      optionGamma = ref.greeks?.gamma ?? null;
      optionTheta = ref.greeks?.theta ?? null;
      optionVega = ref.greeks?.vega ?? null;
    }
  }

  const ceSnap = legSnapshot(atmCall);
  const peSnap = legSnapshot(atmPut);
  const ivSkew =
    ceSnap?.iv != null && peSnap?.iv != null
      ? +(peSnap.iv - ceSnap.iv).toFixed(2)
      : null;

  return {
    score,
    signal,
    bias,
    ivRegime,
    conviction,
    confidence,
    components: parts,
    explanations,
    atmStrike,
    maxPain,
    pcr: pcrRaw,
    callOiTotal,
    putOiTotal,
    guardLevels,
    atmGreeks: {
      atmStrike,
      ce: ceSnap,
      pe: peSnap,
      ivSkew,
    },
    optionPremium,
    optionStrike,
    optionDelta,
    optionGamma,
    optionTheta,
    optionVega,
    optionSide: selectedSide,
  };
}

/**
 * Index points the underlying must move (from spot) for the option leg to reach
 * `targetPnlPerLot`, using delta + gamma (Taylor expansion of premium vs spot).
 */
export function solveIndexMoveForTargetPnl(
  targetPnlPerLot: number,
  lotSize: number,
  delta: number | null,
  gamma: number | null,
): number | null {
  if (!lotSize || lotSize <= 0 || targetPnlPerLot === 0) return 0;
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 1e-6) {
    return null;
  }

  const premiumChange = targetPnlPerLot / lotSize;
  const g = gamma ?? 0;

  if (Math.abs(g) < 1e-9) {
    return premiumChange / delta;
  }

  const disc = delta * delta + 2 * g * premiumChange;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  const rootA = (-delta + sqrtDisc) / g;
  const rootB = (-delta - sqrtDisc) / g;

  const candidates = [rootA, rootB].filter((r) => Number.isFinite(r));
  if (!candidates.length) return null;

  const sameSign = (a: number, b: number) =>
    (a >= 0 && b >= 0) || (a <= 0 && b <= 0);

  const preferred = candidates.find((r) => sameSign(r, premiumChange));
  if (preferred != null) return preferred;

  return candidates.reduce((best, r) =>
    Math.abs(r) < Math.abs(best) ? r : best,
  );
}

export function estimateRiskPerLot(
  premium: number | null,
  lotSize: number,
  delta: number | null,
  spotMove: number = 50,
): number | null {
  if (premium == null || premium <= 0 || lotSize <= 0) return null;
  const deltaRisk =
    delta != null && Math.abs(delta) > 0.05
      ? Math.abs(delta) * spotMove * lotSize
      : null;
  const premiumRisk = premium * lotSize * 0.85;
  if (deltaRisk != null) {
    return Math.round(Math.max(premiumRisk * 0.35, Math.min(premiumRisk, deltaRisk)));
  }
  return Math.round(premiumRisk);
}

