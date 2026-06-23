const runtimeByKey = new Map<string, AutoEntryRuntimeState>();

export interface AutoEntryRuntimeState {
  pendingKey: string | null;
  pendingAction: string | null;
  pendingReason: string | null;
  confirmationCount: number;
  lastExecutedAt: string | null;
  lastExecutionNote: string | null;
  lastEvaluatedAt: string | null;
}

const EMPTY: AutoEntryRuntimeState = {
  pendingKey: null,
  pendingAction: null,
  pendingReason: null,
  confirmationCount: 0,
  lastExecutedAt: null,
  lastExecutionNote: null,
  lastEvaluatedAt: null,
};

export function autoEntryStateKey(indexSymbol: string): string {
  return indexSymbol.trim();
}

export function getAutoEntryRuntimeState(key: string): AutoEntryRuntimeState {
  return { ...(runtimeByKey.get(key) ?? EMPTY) };
}

export function setAutoEntryRuntimeState(
  key: string,
  state: AutoEntryRuntimeState,
): void {
  runtimeByKey.set(key, { ...state });
}

export function resetAutoEntryRuntimeState(key: string): void {
  runtimeByKey.delete(key);
}