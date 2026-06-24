import { TradeSignal } from '../types/options.js';

export type OptionPaAlignment = 'confirm' | 'veto' | 'neutral' | 'skipped';

export function resolvePaAlignment(
  paAction: string | undefined,
  optionSignal: TradeSignal | string,
  vetoMode: string,
): { alignment: OptionPaAlignment; detail: string } {
  if (!paAction || paAction === 'NO-TRADE' || paAction === 'NEUTRAL') {
    return {
      alignment: 'skipped',
      detail: 'No active price-action direction to compare.',
    };
  }
  if (vetoMode === 'off') {
    return {
      alignment: 'skipped',
      detail: 'Chart veto off — option chain shown for context only.',
    };
  }

  const paDir =
    paAction === 'CE-BUY' ? 'bullish' : paAction === 'PE-BUY' ? 'bearish' : 'neutral';
  const signalRaw = String(optionSignal).toUpperCase();
  const optDir =
    signalRaw.includes('BULLISH')
      ? 'bullish'
      : signalRaw.includes('BEARISH')
        ? 'bearish'
        : 'neutral';

  if (paDir === 'neutral' || optDir === 'neutral') {
    return {
      alignment: 'neutral',
      detail: 'Option flow is non-directional — no confirmation or veto.',
    };
  }

  if (paDir === optDir) {
    return {
      alignment: 'confirm',
      detail: `Option flow confirms ${paAction} (${vetoMode} mode).`,
    };
  }

  if (vetoMode === 'strict') {
    return {
      alignment: 'veto',
      detail: `Option flow opposes ${paAction} — strict mode veto.`,
    };
  }

  return {
    alignment: 'neutral',
    detail: `Option flow opposes ${paAction} — ${vetoMode} mode (soft warning).`,
  };
}