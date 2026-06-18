export interface MarketStreamCoordinatorHooks {
  syncOpenOutcomeSymbols: (symbols: string[]) => void;
  addWatchIndexSymbols: (symbols: string[]) => void;
}

let hooks: MarketStreamCoordinatorHooks | null = null;

export function bindMarketStreamHooks(
  next: MarketStreamCoordinatorHooks | null,
): void {
  hooks = next;
}

export function notifyOpenOutcomeSymbols(symbols: string[]): void {
  hooks?.syncOpenOutcomeSymbols(symbols);
}

export function notifyWatchIndexSymbols(symbols: string[]): void {
  hooks?.addWatchIndexSymbols(symbols);
}

const quoteTickListeners = new Set<(symbols: string[]) => void>();

/** Subscribe to Fyers data-WS quote upserts (symbol list per message batch). */
export function onQuoteTicksUpdated(
  listener: (symbols: string[]) => void,
): () => void {
  quoteTickListeners.add(listener);
  return () => {
    quoteTickListeners.delete(listener);
  };
}

export function notifyQuoteTicksUpdated(symbols: string[]): void {
  if (!symbols.length || quoteTickListeners.size === 0) return;
  const unique = [...new Set(symbols.filter(Boolean))];
  if (!unique.length) return;
  for (const listener of quoteTickListeners) {
    try {
      listener(unique);
    } catch {
      // listener errors must not break the WS path
    }
  }
}