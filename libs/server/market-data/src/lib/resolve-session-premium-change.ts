import type { LiveQuote } from './quote-cache.js';

/**
 * Session premium change for an option leg. WS lite ticks often omit ch/chp;
 * fall back to Fyers chain row fields when the cached quote has zero change.
 */
export function resolveSessionPremiumChange(
  quote: LiveQuote | null | undefined,
  rowLtpch?: number | null,
  rowLtpchp?: number | null,
): { ltpChange: number; ltpChangePct: number } {
  if (quote && (quote.ch !== 0 || quote.chp !== 0)) {
    return { ltpChange: quote.ch, ltpChangePct: quote.chp };
  }
  if (rowLtpch != null && rowLtpch !== 0) {
    return { ltpChange: rowLtpch, ltpChangePct: rowLtpchp ?? 0 };
  }
  return {
    ltpChange: quote?.ch ?? 0,
    ltpChangePct: quote?.chp ?? 0,
  };
}