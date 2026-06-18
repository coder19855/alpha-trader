export function diffSymbolSets(
  desired: Set<string>,
  active: Set<string>,
): { subscribe: string[]; unsubscribe: string[] } {
  const subscribe: string[] = [];
  const unsubscribe: string[] = [];

  for (const symbol of desired) {
    if (!active.has(symbol)) subscribe.push(symbol);
  }
  for (const symbol of active) {
    if (!desired.has(symbol)) unsubscribe.push(symbol);
  }

  return { subscribe, unsubscribe };
}