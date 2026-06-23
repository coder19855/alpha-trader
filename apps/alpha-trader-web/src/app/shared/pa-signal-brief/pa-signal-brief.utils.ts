import {
  DeckGaugeReading,
  DeckLiveTick,
  DeckMarketRegime,
  DeckTradeSetup,
  PaDrilldown,
} from '../../core/models/deck.models';
import { drilldownRow, drilldownSection } from '../pa-signal-insights/pa-drilldown-utils';

export interface PaBriefInput {
  action: string;
  structuralAction?: string;
  conviction: number;
  entryThreshold: number;
  bias?: string;
  chartVetoed?: boolean;
  vetoReason?: string;
  tfAligned?: number;
  tfAlignedTotal?: number;
  lastPrice?: number;
  paDrilldown?: PaDrilldown | null;
  tradeSetup?: DeckTradeSetup | null;
  marketRegime?: DeckMarketRegime | null;
  patternInsights?: DeckLiveTick['patternInsights'];
  reading?: DeckGaugeReading;
  primaryTimeframe?: string;
  signalAt: string;
}

export interface PaBriefSnapshot {
  at: string;
  updatedAt: string;
  headline: string;
  summary: string;
  bullets: string[];
  actionLabel: string;
  fingerprint: string;
}

export function buildPaBrief(input: PaBriefInput): PaBriefSnapshot {
  const action = input.action || 'NO-TRADE';
  const structural = input.structuralAction || action;
  const conviction = input.conviction ?? 0;
  const threshold = input.entryThreshold ?? 60;
  const tfTotal = input.tfAlignedTotal ?? 3;
  const tfAligned = input.tfAligned ?? 0;
  const primaryTf = (
    input.primaryTimeframe ??
    input.paDrilldown?.primaryTimeframe ??
    '15m'
  ).toLowerCase();

  const strength = drilldownRow(input.paDrilldown, 'signal-gates', 'Strength')?.value;
  const mtf = drilldownRow(input.paDrilldown, 'confluence', 'MTF score')?.value;
  const session = drilldownRow(input.paDrilldown, 'market-context', 'Session')?.value;
  const sessionBias = drilldownRow(input.paDrilldown, 'market-context', 'Session bias')?.value;
  const volatility = drilldownRow(input.paDrilldown, 'market-context', 'Volatility')?.value;
  const trendQuality = drilldownRow(input.paDrilldown, 'market-context', 'Trend quality')?.value;
  const deadMarket = drilldownRow(input.paDrilldown, 'market-context', 'Dead market')?.value;

  const levels = drilldownSection(input.paDrilldown, 'levels')
    .slice(0, 4)
    .map((row) => `${row.label} ${row.value}`)
    .join(' · ');

  const patterns = (input.patternInsights ?? [])
    .filter((row) => row.pattern && !/^none$/i.test(row.pattern))
    .slice(0, 3)
    .map((row) => `${row.timeframe} ${row.pattern}`)
    .join(', ');

  const needle = input.reading?.value ?? 0;
  const needleSide =
    needle >= 0.35 ? 'bullish' : needle <= -0.35 ? 'bearish' : 'neutral';
  const gateMet = conviction >= threshold;
  const directional = action !== 'NO-TRADE';
  const vetoed = Boolean(input.chartVetoed);

  const headline = buildHeadline({
    action,
    structural,
    vetoed,
    gateMet,
    directional,
    conviction,
    threshold,
  });

  const summary = buildSummary({
    action,
    structural,
    conviction,
    threshold,
    gateMet,
    vetoed,
    tfAligned,
    tfTotal,
    primaryTf,
    needleSide,
    bias: input.bias,
    regime: input.marketRegime,
    strength,
    mtf,
    session,
    sessionBias,
    deadMarket,
  });

  const bullets = buildBullets({
    action,
    structural,
    conviction,
    threshold,
    gateMet,
    vetoed,
    vetoReason: input.vetoReason,
    tradeSetup: input.tradeSetup,
    levels,
    patterns,
    volatility,
    trendQuality,
    primaryTf,
    tfAligned,
    tfTotal,
    lastPrice: input.lastPrice,
    deadMarket,
  });

  const fingerprint = [
    action,
    structural,
    conviction,
    threshold,
    tfAligned,
    vetoed ? input.vetoReason ?? 'veto' : 'clear',
    strength ?? '',
    mtf ?? '',
    patterns,
    levels,
    tradeSetupFingerprint(input.tradeSetup),
    input.marketRegime?.kind ?? '',
    input.marketRegime?.direction ?? '',
    deadMarket ?? '',
  ].join('|');

  const at = input.signalAt || new Date().toISOString();

  return {
    at,
    updatedAt: at,
    headline,
    summary,
    bullets,
    actionLabel: action,
    fingerprint,
  };
}

function buildHeadline(args: {
  action: string;
  structural: string;
  vetoed: boolean;
  gateMet: boolean;
  directional: boolean;
  conviction: number;
  threshold: number;
}): string {
  if (args.vetoed) {
    return `Stand aside — chart veto blocking ${args.structural} read`;
  }
  if (args.directional && args.gateMet) {
    return `${args.action} ready — conviction cleared the ${args.threshold}% gate`;
  }
  if (args.directional && !args.gateMet) {
    return `${args.action} bias, but conviction still ${args.conviction}% (needs ${args.threshold}%)`;
  }
  if (args.structural !== 'NO-TRADE' && args.action === 'NO-TRADE') {
    return `Wait — structure leans ${args.structural}, gates keep action flat`;
  }
  return `No trade — stay patient (${args.conviction}% vs ${args.threshold}% gate)`;
}

function buildSummary(args: {
  action: string;
  structural: string;
  conviction: number;
  threshold: number;
  gateMet: boolean;
  vetoed: boolean;
  tfAligned: number;
  tfTotal: number;
  primaryTf: string;
  needleSide: string;
  bias?: string;
  regime?: DeckMarketRegime | null;
  strength?: string;
  mtf?: string;
  session?: string;
  sessionBias?: string;
  deadMarket?: string;
}): string {
  const parts: string[] = [];

  if (args.bias?.trim()) {
    parts.push(args.bias.trim());
  } else {
    parts.push(
      `Primary ${args.primaryTf} needle is ${args.needleSide} while ${args.tfAligned}/${args.tfTotal} timeframes align.`,
    );
  }

  if (args.regime?.label) {
    parts.push(`Market regime: ${args.regime.label.toLowerCase()}${args.regime.hint ? ` — ${args.regime.hint}` : ''}.`);
  }

  if (args.session) {
    parts.push(`Session context: ${args.session}${sessionBiasSuffix(args.sessionBias)}.`);
  }

  if (args.strength || args.mtf) {
    const stack = [args.strength ? `strength ${args.strength}` : null, args.mtf ? `MTF ${args.mtf}` : null]
      .filter(Boolean)
      .join(', ');
    parts.push(`Signal stack shows ${stack}.`);
  }

  if (args.deadMarket && !/^no$/i.test(args.deadMarket)) {
    parts.push(`Liquidity flag: ${args.deadMarket.toLowerCase()} — size down or skip marginal setups.`);
  }

  if (args.vetoed) {
    parts.push('Hard chart veto is active, so do not force entries against structure blocks.');
  } else if (args.action !== 'NO-TRADE' && args.gateMet) {
    parts.push(`Actionable bias is ${args.action} with conviction at ${args.conviction}% (above ${args.threshold}% threshold).`);
  } else if (args.structural !== 'NO-TRADE') {
    parts.push(`Structure still points ${args.structural}, but conviction ${args.conviction}% has not cleared ${args.threshold}%.`);
  } else {
    parts.push(`Conviction ${args.conviction}% is below the ${args.threshold}% entry gate — let price prove direction first.`);
  }

  return parts.join(' ');
}

function sessionBiasSuffix(sessionBias?: string): string {
  if (!sessionBias?.trim()) return '';
  return `, bias ${sessionBias.toLowerCase()}`;
}

function buildBullets(args: {
  action: string;
  structural: string;
  conviction: number;
  threshold: number;
  gateMet: boolean;
  vetoed: boolean;
  vetoReason?: string;
  tradeSetup?: DeckTradeSetup | null;
  levels: string;
  patterns: string;
  volatility?: string;
  trendQuality?: string;
  primaryTf: string;
  tfAligned: number;
  tfTotal: number;
  lastPrice?: number;
  deadMarket?: string;
}): string[] {
  const bullets: string[] = [];

  if (args.vetoed) {
    bullets.push(
      `Do not enter — chart veto${args.vetoReason ? `: ${args.vetoReason}` : ' is active'}.`,
    );
  } else if (args.action !== 'NO-TRADE' && args.gateMet) {
    bullets.push(`Consider ${args.action} on ${args.primaryTf} trigger; conviction is live at ${args.conviction}%.`);
  } else if (args.structural !== 'NO-TRADE') {
    bullets.push(`Watch for ${args.structural} confirmation — need ${args.threshold - args.conviction} more conviction points.`);
  } else {
    bullets.push('Stay flat until structure and conviction agree on direction.');
  }

  const setup = args.tradeSetup;
  if (setup && Number.isFinite(setup.entry) && setup.risk > 0) {
    const tp = setup.takeProfits[0];
    bullets.push(
      `If taking risk: entry ${setup.entry.toFixed(2)}, stop ${setup.stopLoss.toFixed(2)} (${setup.risk.toFixed(2)} pts)${tp ? `, first target ${tp.price.toFixed(2)} (${tp.rr})` : ''}.`,
    );
  } else if (!args.vetoed && args.structural !== 'NO-TRADE') {
    bullets.push('No published trade setup yet — wait for a validated CE/PE entry template.');
  }

  if (args.tfAligned < 2) {
    bullets.push(`Only ${args.tfAligned}/${args.tfTotal} timeframes agree — demand stronger MTF alignment before sizing up.`);
  } else {
    bullets.push(`${args.tfAligned}/${args.tfTotal} timeframes aligned — trend context supports the primary read.`);
  }

  if (args.levels) {
    bullets.push(`Levels to respect: ${args.levels}.`);
  }

  if (args.patterns) {
    bullets.push(`Pattern watch: ${args.patterns}.`);
  }

  if (args.volatility) {
    bullets.push(`Volatility: ${args.volatility.toLowerCase()}${args.trendQuality ? `, trend quality ${args.trendQuality.toLowerCase()}` : ''}.`);
  }

  if (args.lastPrice != null && Number.isFinite(args.lastPrice)) {
    bullets.push(`Spot reference: ${args.lastPrice.toFixed(2)}.`);
  }

  if (args.deadMarket && !/^no$/i.test(args.deadMarket)) {
    bullets.push('Reduce size or skip — dead-market filter is on.');
  }

  return bullets.slice(0, 6);
}

function tradeSetupFingerprint(setup?: DeckTradeSetup | null): string {
  if (!setup || !Number.isFinite(setup.entry)) return '';
  return `${setup.entry}|${setup.stopLoss}|${setup.risk}`;
}