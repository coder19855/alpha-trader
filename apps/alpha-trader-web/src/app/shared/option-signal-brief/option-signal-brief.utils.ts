import { OptionChainSignalPayload } from '../../core/models/option-chain.models';

export interface OcBriefSnapshot {
  at: string;
  updatedAt: string;
  headline: string;
  summary: string;
  bullets: string[];
  actionLabel: string;
  fingerprint: string;
}

export function buildOcBrief(
  oc: OptionChainSignalPayload,
  signalAt?: string,
): OcBriefSnapshot {
  const at = signalAt || oc.fetchedAt || new Date().toISOString();
  const signal = oc.signal || 'NEUTRAL';
  const conviction = oc.conviction ?? 0;
  const score = oc.score ?? 0;
  const guard = oc.guard;
  const pcr = guard?.pcr ?? 1;
  const maxPain = guard?.maxPain;
  const spot = guard?.spotLtp;
  const vix = guard?.indiaVix;
  const skew = oc.atmGreeks?.ivSkew;

  const headline = buildHeadline({
    signal,
    conviction,
    paAlignment: oc.paAlignment,
    score,
  });

  const summary = buildSummary({
    signal,
    bias: oc.bias,
    ivRegime: oc.ivRegime,
    conviction,
    score,
    pcr,
    maxPain,
    spot,
    vix,
    skew,
    paAlignment: oc.paAlignment,
    paAlignmentDetail: oc.paAlignmentDetail,
    moneyness: oc.moneyness,
    optionSide: oc.optionSide,
    confidence: oc.confidence?.percent,
  });

  const bullets = buildBullets({
    signal,
    conviction,
    guard,
    oc,
    skew,
    vix,
  });

  const fingerprint = [
    signal,
    conviction,
    score,
    oc.paAlignment,
    oc.paAlignmentDetail,
    pcr.toFixed(2),
    maxPain,
    spot,
    vix?.toFixed(1),
    skew?.toFixed(2),
    oc.bias,
    oc.ivRegime,
    topComponentsFingerprint(oc.componentRows),
    guard?.supportStrike,
    guard?.resistanceStrike,
  ].join('|');

  return {
    at,
    updatedAt: at,
    headline,
    summary,
    bullets,
    actionLabel: formatActionLabel(signal),
    fingerprint,
  };
}

function formatActionLabel(signal: string): string {
  if (signal.includes('BULLISH')) return 'BULLISH FLOW';
  if (signal.includes('BEARISH')) return 'BEARISH FLOW';
  return 'NEUTRAL FLOW';
}

function buildHeadline(args: {
  signal: string;
  conviction: number;
  paAlignment: OptionChainSignalPayload['paAlignment'];
  score: number;
}): string {
  if (args.paAlignment === 'veto') {
    return `Option flow conflicts with price action — treat chain as cautionary only`;
  }
  if (args.signal.includes('BULLISH') && args.conviction >= 55) {
    return `Bullish option flow building — ${args.conviction}% chain conviction`;
  }
  if (args.signal.includes('BEARISH') && args.conviction >= 55) {
    return `Bearish option flow building — ${args.conviction}% chain conviction`;
  }
  if (args.signal.includes('NEUTRAL') || Math.abs(args.score) < 20) {
    return `Neutral chain — wait for clearer writer positioning`;
  }
  return `${formatActionLabel(args.signal)} — conviction ${args.conviction}%`;
}

function buildSummary(args: {
  signal: string;
  bias: string;
  ivRegime: string;
  conviction: number;
  score: number;
  pcr: number;
  maxPain?: number;
  spot?: number;
  vix?: number;
  skew?: number | null;
  paAlignment: OptionChainSignalPayload['paAlignment'];
  paAlignmentDetail: string;
  moneyness?: string;
  optionSide?: string;
  confidence?: number;
}): string {
  const parts: string[] = [];

  if (args.bias?.trim()) {
    parts.push(args.bias.trim());
  }

  parts.push(
    `Chain reads ${args.signal.toLowerCase().replace(/_/g, ' ')} with ${args.conviction}% flow conviction and score ${args.score.toFixed(0)}.`,
  );

  if (args.ivRegime) {
    parts.push(`IV regime: ${args.ivRegime.toLowerCase()}.`);
  }

  if (args.pcr > 1.1) {
    parts.push(`PCR ${args.pcr.toFixed(2)} — put OI outweighs calls (defensive positioning / support bias).`);
  } else if (args.pcr < 0.9) {
    parts.push(`PCR ${args.pcr.toFixed(2)} — call OI dominates (supply overhead / cautious upside).`);
  } else {
    parts.push(`PCR ${args.pcr.toFixed(2)} — relatively balanced OI between calls and puts.`);
  }

  if (args.maxPain != null && args.spot != null && Number.isFinite(args.maxPain) && Number.isFinite(args.spot)) {
    const dist = args.spot - args.maxPain;
    if (Math.abs(dist) <= 20) {
      parts.push(`Spot is near max pain (${args.maxPain}) — pinning/chop risk into the close.`);
    } else if (dist > 20) {
      parts.push(`Spot ${dist.toFixed(0)} pts above max pain (${args.maxPain}) — mild gravitational pull lower.`);
    } else {
      parts.push(`Spot ${Math.abs(dist).toFixed(0)} pts below max pain (${args.maxPain}) — mild pull higher.`);
    }
  }

  if (args.skew != null && Number.isFinite(args.skew)) {
    if (args.skew > 0.5) {
      parts.push('Put IV richer than calls — hedgers paying for downside protection.');
    } else if (args.skew < -0.5) {
      parts.push('Call IV richer than puts — upside demand showing in premiums.');
    }
  }

  if (args.vix != null && Number.isFinite(args.vix)) {
    parts.push(
      `India VIX at ${args.vix.toFixed(1)}${
        args.vix >= 18 ? ' — elevated fear, wider option swings expected' : args.vix <= 12 ? ' — calm tape, premiums may compress' : ''
      }.`,
    );
  }

  if (args.paAlignment === 'confirm' && args.paAlignmentDetail) {
    parts.push(`PA alignment: ${args.paAlignmentDetail}`);
  } else if (args.paAlignment === 'veto' && args.paAlignmentDetail) {
    parts.push(`PA conflict: ${args.paAlignmentDetail}`);
  } else if (args.paAlignment === 'neutral') {
    parts.push('Option flow is not strongly confirming price action — use as secondary context.');
  }

  if (args.confidence != null) {
    parts.push(`Model confidence on this read: ${args.confidence}%.`);
  }

  if (args.moneyness && args.optionSide) {
    parts.push(`Suggested expression: ${args.moneyness} ${args.optionSide} if you trade the flow leg.`);
  }

  return parts.join(' ');
}

function buildBullets(args: {
  signal: string;
  conviction: number;
  guard: OptionChainSignalPayload['guard'];
  oc: OptionChainSignalPayload;
  skew?: number | null;
  vix?: number;
}): string[] {
  const bullets: string[] = [];
  const { guard, oc } = args;

  if (oc.paAlignment === 'veto') {
    bullets.push('Do not let option flow override PA — wait for alignment or reduce size.');
  } else if (oc.paAlignment === 'confirm') {
    bullets.push('Chain confirms PA — flow can support entry sizing and direction confidence.');
  } else if (oc.signal.includes('BULLISH')) {
    bullets.push('Bullish flow — look for call-side confirmation near support or on PA CE triggers.');
  } else if (oc.signal.includes('BEARISH')) {
    bullets.push('Bearish flow — look for put-side confirmation near resistance or on PA PE triggers.');
  } else {
    bullets.push('Neutral flow — avoid forcing option bias; let PA lead until writers show a clear side.');
  }

  if (guard.supportStrike != null) {
    bullets.push(`Support wall near ${guard.supportStrike} (put OI cluster).`);
  }
  if (guard.resistanceStrike != null) {
    bullets.push(`Resistance wall near ${guard.resistanceStrike} (call OI cluster).`);
  }
  if (guard.intradaySupport != null || guard.intradayResistance != null) {
    const levels = [
      guard.intradaySupport != null ? `intraday support ${guard.intradaySupport}` : null,
      guard.intradayResistance != null ? `resistance ${guard.intradayResistance}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    if (levels) bullets.push(`Intraday levels: ${levels}.`);
  }

  if (oc.optionStrike != null && oc.optionPremium != null) {
    bullets.push(
      `Reference leg: ${oc.optionSide ?? '—'} ${oc.optionStrike} @ ₹${oc.optionPremium.toFixed(1)}${
        oc.estRiskPerLot != null ? ` (~₹${oc.estRiskPerLot.toFixed(0)}/lot risk)` : ''
      }.`,
    );
  }

  const top = [...oc.componentRows]
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 2)
    .map((row) => `${row.name} ${row.score >= 0 ? '+' : ''}${row.score.toFixed(2)}`)
    .join(', ');
  if (top) {
    bullets.push(`Strongest flow drivers: ${top}.`);
  }

  if (args.vix != null && args.vix >= 18) {
    bullets.push('High VIX — prefer defined risk and slightly wider stops on option legs.');
  }

  return bullets.slice(0, 6);
}

function topComponentsFingerprint(
  rows: OptionChainSignalPayload['componentRows'],
): string {
  return [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => `${row.id}:${row.score.toFixed(2)}`)
    .join(',');
}