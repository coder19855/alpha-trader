import type { Focus } from '@alpha-trader/server-shared';

export interface ScoreMetricsResponse {
  score: number;
  message: string;
}

export interface Explanation {
  name: string;
  score: number | null;
  value?: number;
  meaning: string;
  interpretation: string;
  weightage: number;
  focus?: Focus;
}

export interface ScoreComponents {
  oi: number;
  pcr: number;
  skew: number | null;
  iv: number | null;
  pain: number;
  greeks: number | null;
  vix: number;
  trend: number;
}