import { BenchmarkPositionPolicy } from './position-policy.js';
import { ScaleOutState } from './position-policy.js';
import {
  BenchmarkExitPolicy,
  ChandelierState,
} from '@alpha-trader/server-analysis';
import { StructureTrailState } from '@alpha-trader/server-analysis';
import { AutoExitHitLevel } from './auto-exit-evaluator.js';

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
}

const stateByKey = new Map<string, AutoExitRuntimeState>();

export function autoExitStateKey(indexSymbol: string, direction: string): string {
  return `${indexSymbol}:${direction}`;
}

export function getAutoExitRuntimeState(key: string): AutoExitRuntimeState {
  return (
    stateByKey.get(key) ?? {
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
    }
  );
}

export function setAutoExitRuntimeState(
  key: string,
  next: AutoExitRuntimeState,
): void {
  stateByKey.set(key, next);
}

export function resetAutoExitRuntimeState(key?: string): void {
  if (key) {
    stateByKey.delete(key);
    return;
  }
  stateByKey.clear();
}