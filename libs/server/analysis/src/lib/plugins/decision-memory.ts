const DECISION_MEMORY_MAX_SYMBOLS = 128;
export const DECISION_HISTORY_MAX = 8;
const SECOND_ENTRY_PAUSE_ACTIONS = new Set(['NO-TRADE', 'NEUTRAL']);

export type StoredDecisionAction =
  | 'CE-BUY'
  | 'PE-BUY'
  | 'NEUTRAL'
  | 'NO-TRADE';

const decisionMemory = new Map<string, StoredDecisionAction[]>();
const decisionMemoryOrder: string[] = [];

function touchDecisionMemorySymbol(symbol: string): void {
  const existing = decisionMemoryOrder.indexOf(symbol);
  if (existing >= 0) {
    decisionMemoryOrder.splice(existing, 1);
  }
  decisionMemoryOrder.push(symbol);
  while (decisionMemoryOrder.length > DECISION_MEMORY_MAX_SYMBOLS) {
    const evicted = decisionMemoryOrder.shift();
    if (evicted) decisionMemory.delete(evicted);
  }
}

export function getDecisionHistory(symbol: string): StoredDecisionAction[] {
  if (!decisionMemory.has(symbol)) {
    decisionMemory.set(symbol, []);
  }
  touchDecisionMemorySymbol(symbol);
  return decisionMemory.get(symbol)!;
}

/** Brooks H2/L2: same-direction entry, then NO-TRADE/NEUTRAL pause (opposite entries do not count). */
export function detectSecondEntry(
  history: StoredDecisionAction[],
  trigger: 'CE-BUY' | 'PE-BUY',
): boolean {
  if (history.length < 2) return false;
  const prev = history[history.length - 1];
  const beforePrev = history[history.length - 2];
  return SECOND_ENTRY_PAUSE_ACTIONS.has(prev) && beforePrev === trigger;
}

export function clearDecisionMemory(): void {
  decisionMemory.clear();
  decisionMemoryOrder.length = 0;
}