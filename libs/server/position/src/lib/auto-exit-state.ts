import { BenchmarkPositionPolicy } from './position-policy.js';
import { ScaleOutState } from './position-policy.js';
import {
  BenchmarkExitPolicy,
  ChandelierState,
} from '@alpha-trader/server-analysis';
import { StructureTrailState } from '@alpha-trader/server-analysis';
import { AutoExitHitLevel } from './auto-exit-evaluator.js';

export interface AutoExitTraceEvent {
  at: string;
  stage:
    | 'off'
    | 'watching'
    | 'blocked'
    | 'pending'
    | 'executed'
    | 'scale_out'
    | 'cooldown';
  tone: 'neutral' | 'success' | 'warn' | 'error';
  title: string;
  detail?: string;
}

export interface AutoExitRuntimeState {
  peakR: number;
  pendingHitLevel: AutoExitHitLevel | null;
  confirmationCount: number;
  lastReason: string | null;
  lastEvaluatedAt: string | null;
  lastExecutedAt: string | null;
  lastExecutionNote: string | null;
  lastSpot: number | null;
  runningAtr: number;
  chandelier: ChandelierState | null;
  structure: StructureTrailState | null;
  scaleOut: ScaleOutState | null;
  activeExitPolicy: BenchmarkExitPolicy | null;
  activePositionPolicy: BenchmarkPositionPolicy | null;
  recentEvents: AutoExitTraceEvent[];
}

const EMPTY: AutoExitRuntimeState = {
  peakR: 0,
  pendingHitLevel: null,
  confirmationCount: 0,
  lastReason: null,
  lastEvaluatedAt: null,
  lastExecutedAt: null,
  lastExecutionNote: null,
  lastSpot: null,
  runningAtr: 0,
  chandelier: null,
  structure: null,
  scaleOut: null,
  activeExitPolicy: null,
  activePositionPolicy: null,
  recentEvents: [],
};

const stateByKey = new Map<string, AutoExitRuntimeState>();

export function autoExitStateKey(indexSymbol: string, direction: string): string {
  return `${indexSymbol}:${direction}`;
}

export function getAutoExitRuntimeState(key: string): AutoExitRuntimeState {
  return { ...(stateByKey.get(key) ?? EMPTY) };
}

export function setAutoExitRuntimeState(
  key: string,
  next: AutoExitRuntimeState,
): void {
  stateByKey.set(key, { ...next });
}

export function resetAutoExitRuntimeState(key?: string): void {
  if (key) {
    stateByKey.delete(key);
    return;
  }
  stateByKey.clear();
}

export function recordAutoExitTraceEvent(
  key: string,
  event: AutoExitTraceEvent,
): void {
  const current = stateByKey.get(key) ?? EMPTY;
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
  stateByKey.set(key, {
    ...current,
    recentEvents: nextEvents.slice(-8),
  });
}