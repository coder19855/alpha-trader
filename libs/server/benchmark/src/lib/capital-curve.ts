import { POSITION_SIZING_DEFAULTS } from '@alpha-trader/server-shared';
import { BENCHMARK_DEFAULT_STARTING_CAPITAL_INR } from '@alpha-trader/server-shared';
import { computeDrawdownFromSeries } from '@alpha-trader/server-analysis';
import { TradingStyle } from '@alpha-trader/server-shared';
import { BenchmarkCapitalSummary, BenchmarkPnlModel, BenchmarkTradeRow } from './types.js';

export function resolveBenchmarkRiskPercent(
  tradingStyle: TradingStyle,
  override?: number,
): number {
  if (override != null && Number.isFinite(override) && override > 0) {
    return Math.min(
      POSITION_SIZING_DEFAULTS.MAX_RISK_PERCENT,
      Math.max(POSITION_SIZING_DEFAULTS.MIN_RISK_PERCENT, override),
    );
  }
  return POSITION_SIZING_DEFAULTS.RISK_BY_STYLE[tradingStyle];
}

function buildIndexCapitalProjection(
  trades: BenchmarkTradeRow[],
  tradingStyle: TradingStyle,
  startingCapitalInr: number,
  riskPercentOverride?: number,
): {
  summary: BenchmarkCapitalSummary;
  capitalCurve: Array<{ t: number; capitalInr: number; pnlInr: number; label: string }>;
  trades: BenchmarkTradeRow[];
} {
  const riskPercent = resolveBenchmarkRiskPercent(tradingStyle, riskPercentOverride);
  let capital = startingCapitalInr;
  const capitalCurve: Array<{
    t: number;
    capitalInr: number;
    pnlInr: number;
    label: string;
  }> = [
    {
      t: trades[0]?.signalAtMs ?? Date.now(),
      capitalInr: startingCapitalInr,
      pnlInr: 0,
      label: 'Start',
    },
  ];

  const enriched = trades.map((trade) => {
    const riskBudgetInr = +((capital * riskPercent) / 100).toFixed(2);
    const pnlInr = +(riskBudgetInr * trade.pnlR).toFixed(2);
    capital = +(capital + pnlInr).toFixed(2);
    capitalCurve.push({
      t: trade.signalAtMs,
      capitalInr: capital,
      pnlInr,
      label: `${trade.action} ${trade.hitLevel}`,
    });
    return { ...trade, riskBudgetInr, pnlInr };
  });

  const endingCapitalInr = capital;
  const netPnlInr = +(endingCapitalInr - startingCapitalInr).toFixed(2);
  const netPnlPercent =
    startingCapitalInr > 0
      ? +((netPnlInr / startingCapitalInr) * 100).toFixed(2)
      : 0;

  const capitalDd = computeDrawdownFromSeries(
    capitalCurve.map((p) => p.capitalInr),
  );
  let cumulativeR = 0;
  const rSeries = trades.map((t) => {
    cumulativeR += t.pnlR;
    return cumulativeR;
  });
  const rDd = computeDrawdownFromSeries(rSeries);

  return {
    summary: {
      startingCapitalInr,
      endingCapitalInr,
      netPnlInr,
      netPnlPercent,
      riskPercentPerTrade: riskPercent,
      compounding: true,
      maxDrawdownInr: capitalDd.maxDrawdown,
      maxDrawdownPercent: capitalDd.maxDrawdownPercent,
      maxDrawdownR: rDd.maxDrawdown,
      note: `Each trade risks ${riskPercent}% of running capital; P&L = risk budget × R-multiple. Max DD from equity peak.`,
    },
    capitalCurve,
    trades: enriched,
  };
}

function buildSyntheticOptionCapitalProjection(
  trades: BenchmarkTradeRow[],
  startingCapitalInr: number,
): {
  summary: BenchmarkCapitalSummary;
  capitalCurve: Array<{ t: number; capitalInr: number; pnlInr: number; label: string }>;
  trades: BenchmarkTradeRow[];
} {
  let capital = startingCapitalInr;
  const capitalCurve: Array<{
    t: number;
    capitalInr: number;
    pnlInr: number;
    label: string;
  }> = [
    {
      t: trades[0]?.signalAtMs ?? Date.now(),
      capitalInr: startingCapitalInr,
      pnlInr: 0,
      label: 'Start',
    },
  ];

  const enriched = trades.map((trade) => {
    const pnlInr = +(trade.pnlInr ?? 0).toFixed(2);
    const premiumCostInr = +(
      (trade.optionEntryPremium ?? 0) * (trade.optionLotSize ?? 1) * (trade.optionLots ?? 1)
    ).toFixed(2);
    capital = +(capital + pnlInr).toFixed(2);
    capitalCurve.push({
      t: trade.signalAtMs,
      capitalInr: capital,
      pnlInr,
      label: `${trade.action} opt ${trade.hitLevel}`,
    });
    return { ...trade, riskBudgetInr: premiumCostInr, pnlInr };
  });

  const endingCapitalInr = capital;
  const netPnlInr = +(endingCapitalInr - startingCapitalInr).toFixed(2);
  const netPnlPercent =
    startingCapitalInr > 0
      ? +((netPnlInr / startingCapitalInr) * 100).toFixed(2)
      : 0;

  const capitalDd = computeDrawdownFromSeries(
    capitalCurve.map((p) => p.capitalInr),
  );
  let cumulativeR = 0;
  const rSeries = trades.map((t) => {
    cumulativeR += t.pnlR;
    return cumulativeR;
  });
  const rDd = computeDrawdownFromSeries(rSeries);

  return {
    summary: {
      startingCapitalInr,
      endingCapitalInr,
      netPnlInr,
      netPnlPercent,
      riskPercentPerTrade: 0,
      compounding: true,
      maxDrawdownInr: capitalDd.maxDrawdown,
      maxDrawdownPercent: capitalDd.maxDrawdownPercent,
      maxDrawdownR: rDd.maxDrawdown,
      note: 'Synthetic weekly option: 1 lot/trade; P&L = (exit − entry) premium × lot size. Engine stats still in index R.',
    },
    capitalCurve,
    trades: enriched,
  };
}

export function buildCapitalProjection(
  trades: BenchmarkTradeRow[],
  tradingStyle: TradingStyle,
  startingCapitalInr: number = BENCHMARK_DEFAULT_STARTING_CAPITAL_INR,
  riskPercentOverride?: number,
  pnlModel: BenchmarkPnlModel = 'index',
): {
  summary: BenchmarkCapitalSummary;
  capitalCurve: Array<{ t: number; capitalInr: number; pnlInr: number; label: string }>;
  trades: BenchmarkTradeRow[];
} {
  if (pnlModel === 'synthetic_weekly_option') {
    return buildSyntheticOptionCapitalProjection(trades, startingCapitalInr);
  }
  return buildIndexCapitalProjection(
    trades,
    tradingStyle,
    startingCapitalInr,
    riskPercentOverride,
  );
}

export const BENCHMARK_STOP_LOSS_NOTE =
  'SL: last opposing swing (CE→swing low/support, PE→swing high/resistance), clamped to 0.35–1.5× ATR. Trail locks at 1R/1.5R/2.5R/4R — past 4R ratchets at peakR − 1R; last 45m fade tighten when peak ≥1R.';