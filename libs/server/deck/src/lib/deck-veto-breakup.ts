import {
  FlowMode,
  isHardVetoReason,
  isOptionOnlyFlow,
  isPaOnlyFlow,
  isVetoOff,
  VetoMode,
} from '@alpha-trader/server-shared';

export type DeckVetoBreakupState = 'block' | 'warn' | 'ok' | 'skipped';

export interface DeckVetoBreakupItem {
  id: string;
  label: string;
  state: DeckVetoBreakupState;
  detail: string;
  /** 0–100 severity meter (optional visual). */
  meter?: number;
}

export interface DeckVetoBreakupInput {
  vetoMode: VetoMode;
  flowMode?: FlowMode;
  action: string;
  conviction: number;
  priceConviction: number;
  priceConvictionBeforeDecay?: number;
  optionConviction: number;
  enterThreshold: number;
  conflictLevel?: string;
  alignment?: number;
  paSignal: {
    action: string;
    confidence: number;
    structuralAction?: string;
    vetoReason?: string;
    confidenceBeforeDecay?: number;
    entryPenalties?: Array<{ label: string; points: number }>;
  };
  momentumDecay?: {
    decayPercent: number;
    reasons: string[];
  };
  vetoedByDecay?: boolean;
  minConfidenceAfterDecay?: number;
}

function pushItem(
  items: DeckVetoBreakupItem[],
  item: DeckVetoBreakupItem,
): void {
  items.push(item);
}

function vetoStateForReason(
  reason: string | undefined,
  vetoMode: VetoMode,
): DeckVetoBreakupState {
  if (!reason) return 'ok';
  if (isVetoOff(vetoMode)) return 'skipped';
  if (isHardVetoReason(reason)) return 'block';
  return 'warn';
}

export function buildDeckVetoBreakup(input: DeckVetoBreakupInput): DeckVetoBreakupItem[] {
  const items: DeckVetoBreakupItem[] = [];
  const vetoOff = isVetoOff(input.vetoMode);
  const relaxed = input.vetoMode === 'relaxed';
  const penalties = input.paSignal.entryPenalties ?? [];
  const penaltyTotal = penalties.reduce((sum, row) => sum + row.points, 0);

  pushItem(items, {
    id: 'mode',
    label: 'Veto mode',
    state: vetoOff ? 'skipped' : relaxed ? 'warn' : 'ok',
    detail: vetoOff
      ? 'No structural penalties — threshold only (research)'
      : relaxed
        ? 'Relaxed — 0.45× penalties; hard decay + dead market still block'
        : 'Strict — full penalties; hard decay + dead market block',
  });

  const vetoReason = input.paSignal.vetoReason;
  const chartState = vetoStateForReason(vetoReason, input.vetoMode);
  pushItem(items, {
    id: 'chart',
    label: 'Chart hard gate',
    state: vetoReason ? chartState : 'ok',
    detail: vetoReason
      ? vetoReason
      : input.paSignal.action === 'NO-TRADE'
        ? 'No directional chart read'
        : `Chart allows ${input.paSignal.action}`,
  });

  if (penalties.length > 0) {
    pushItem(items, {
      id: 'penalties-total',
      label: 'Structural penalties',
      state: vetoOff ? 'skipped' : penaltyTotal >= 30 ? 'warn' : 'warn',
      meter: Math.min(100, penaltyTotal * 2),
      detail: `−${penaltyTotal} confidence from ${penalties.length} gate(s)`,
    });
    for (const [idx, row] of penalties.entries()) {
      pushItem(items, {
        id: `penalty-${idx}`,
        label: 'Penalty',
        state: vetoOff ? 'skipped' : 'warn',
        detail: `${row.label} (−${row.points})`,
        meter: Math.min(100, row.points * 3),
      });
    }
  } else if (!vetoOff) {
    pushItem(items, {
      id: 'penalties-total',
      label: 'Structural penalties',
      state: 'ok',
      detail: 'No structural penalties applied',
    });
  }

  const structural = input.paSignal.structuralAction;
  if (
    structural &&
    structural !== 'NO-TRADE' &&
    input.paSignal.action === 'NO-TRADE' &&
    isHardVetoReason(vetoReason)
  ) {
    pushItem(items, {
      id: 'structural',
      label: 'Structural direction',
      state: vetoOff ? 'skipped' : 'block',
      detail: `Structure suggests ${structural} but hard gate forced NO-TRADE`,
    });
  }

  const decayPct = Math.round((input.momentumDecay?.decayPercent ?? 0) * 100);
  if (decayPct > 0 || input.vetoedByDecay) {
    const hardBlock =
      input.vetoedByDecay ||
      (input.momentumDecay?.decayPercent ?? 0) >= 0.3;
    let decayState: DeckVetoBreakupState = 'warn';
    if (vetoOff) decayState = 'skipped';
    else if (hardBlock) decayState = 'block';

    const before =
      input.priceConvictionBeforeDecay ??
      input.paSignal.confidenceBeforeDecay ??
      input.priceConviction;
    pushItem(items, {
      id: 'decay',
      label: 'Momentum decay',
      state: decayState,
      meter: Math.min(100, decayPct),
      detail: `PA ${input.priceConviction}% after ${decayPct}% decay (was ${before}%)`,
    });

    for (const [idx, reason] of (input.momentumDecay?.reasons ?? []).entries()) {
      if (!reason.trim()) continue;
      pushItem(items, {
        id: `decay-reason-${idx}`,
        label: 'Decay factor',
        state: decayState,
        detail: reason,
      });
    }
  } else {
    pushItem(items, {
      id: 'decay',
      label: 'Momentum decay',
      state: 'ok',
      detail: 'No momentum decay applied',
    });
  }

  const conflict = String(input.conflictLevel ?? 'NONE').toUpperCase();
  if (conflict === 'HIGH') {
    pushItem(items, {
      id: 'conflict',
      label: 'Option vs PA conflict',
      state: vetoOff ? 'skipped' : 'warn',
      meter: 85,
      detail: 'Option flow strongly disagrees — conviction penalty applied',
    });
  } else if (conflict === 'MEDIUM') {
    pushItem(items, {
      id: 'conflict',
      label: 'Option vs PA conflict',
      state: vetoOff ? 'skipped' : 'warn',
      meter: 55,
      detail: 'Mild disagreement — lighter conviction penalty',
    });
  } else {
    pushItem(items, {
      id: 'conflict',
      label: 'Option vs PA conflict',
      state: 'ok',
      detail: 'No major option / PA conflict',
    });
  }

  const aligned = input.alignment ?? 0;
  pushItem(items, {
    id: 'alignment',
    label: 'TF alignment',
    state: aligned >= 2 ? 'ok' : aligned === 1 ? 'warn' : 'warn',
    meter: Math.round((aligned / 3) * 100),
    detail: `${aligned}/3 timeframes aligned with primary`,
  });

  const flowMode = input.flowMode ?? 'blend';
  const thresholdDetail = isPaOnlyFlow(flowMode)
    ? `PA-only flow · ${input.conviction}% vs ${input.enterThreshold}% bar (PA ${input.priceConviction}% — option ignored)`
    : isOptionOnlyFlow(flowMode)
      ? `Option-only flow · ${input.conviction}% vs ${input.enterThreshold}% bar (option ${input.optionConviction}% — PA ignored)`
      : `Combined ${input.conviction}% vs ${input.enterThreshold}% bar (option ${input.optionConviction}% · PA ${input.priceConviction}%)`;

  pushItem(items, {
    id: 'enter-threshold',
    label: 'Enter threshold',
    state:
      input.conviction >= input.enterThreshold
        ? 'ok'
        : input.conviction >= input.enterThreshold * 0.7
          ? 'warn'
          : 'block',
    meter: Math.min(
      100,
      Math.round((input.conviction / Math.max(1, input.enterThreshold)) * 100),
    ),
    detail: thresholdDetail,
  });

  if (
    input.action === 'NO-TRADE' &&
    !vetoReason &&
    decayPct === 0 &&
    input.conviction < input.enterThreshold
  ) {
    pushItem(items, {
      id: 'outcome',
      label: 'Decision',
      state: 'warn',
      detail: 'Conviction below enter threshold after penalties',
    });
  }

  const stateOrder: Record<DeckVetoBreakupState, number> = {
    block: 0,
    warn: 1,
    skipped: 2,
    ok: 3,
  };
  return items.sort(
    (a, b) => (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9),
  );
}

export function buildReplayVetoBreakup(input: {
  vetoMode: VetoMode;
  action: string;
  conviction: number;
  vetoed: boolean;
  vetoReason?: string;
  structuralAction?: string;
}): DeckVetoBreakupItem[] {
  return buildDeckVetoBreakup({
    vetoMode: input.vetoMode,
    action: input.action,
    conviction: input.conviction,
    priceConviction: input.conviction,
    optionConviction: 0,
    enterThreshold: 60,
    paSignal: {
      action: input.action,
      confidence: input.conviction,
      structuralAction: input.structuralAction,
      vetoReason: input.vetoReason,
    },
    alignment: input.vetoed ? 0 : 2,
  });
}