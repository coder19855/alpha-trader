const runtimeByKey = new Map<string, AutoEntryRuntimeState>();

export interface AutoEntryTraceEvent {
  at: string;
  stage:
    | 'off'
    | 'watching'
    | 'signal'
    | 'blocked'
    | 'pending'
    | 'executed'
    | 'simulated'
    | 'cooldown';
  tone: 'neutral' | 'success' | 'warn' | 'error';
  title: string;
  detail?: string;
}

export interface AutoEntryRuntimeState {
  pendingKey: string | null;
  pendingAction: string | null;
  pendingReason: string | null;
  confirmationCount: number;
  lastExecutedAt: string | null;
  lastExecutionNote: string | null;
  lastEvaluatedAt: string | null;
  recentEvents: AutoEntryTraceEvent[];
}

const EMPTY: AutoEntryRuntimeState = {
  pendingKey: null,
  pendingAction: null,
  pendingReason: null,
  confirmationCount: 0,
  lastExecutedAt: null,
  lastExecutionNote: null,
  lastEvaluatedAt: null,
  recentEvents: [],
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

export function recordAutoEntryTraceEvent(
  key: string,
  event: AutoEntryTraceEvent,
): void {
  const current = runtimeByKey.get(key) ?? EMPTY;
  const nextEvents = [...(current.recentEvents ?? [])];
  const last = nextEvents[nextEvents.length - 1];
  if (
    last &&
    last.stage === event.stage &&
    last.tone === event.tone &&
    last.title === event.title &&
    last.detail === event.detail
  ) {
    nextEvents[nextEvents.length - 1] = event;
  } else {
    nextEvents.push(event);
  }
  runtimeByKey.set(key, {
    ...current,
    recentEvents: nextEvents.slice(-8),
  });
}