import { TradingStyle } from '@alpha-trader/server-shared';
import type { BenchmarkAiOpinionStats, BenchmarkTradeRow } from './types.js';

export type AIProvider = 'GEMINI' | 'GROQ' | 'OPENAI' | 'XAI';

export type AiErrorReason =
  | 'missing_key'
  | 'invalid_key'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'provider_error'
  | 'parse_error'
  | 'unknown';

export interface AIAnalysisResponse {
  provider: AIProvider;
  model: string;
  verdict: 'AGREE' | 'DISAGREE' | 'CAUTION';
  confidenceAdjustment: number;
  betaNote: string;
  timestamp: number;
  available?: boolean;
  errorReason?: AiErrorReason;
}

export interface OptionChainComponentSnapshot {
  id: string;
  name: string;
  score: number;
  interpretation?: string;
  weightage?: number;
}

export interface OptionChainSnapshotRecord {
  symbol: string;
  tradingStyle: TradingStyle;
  bucketAt: Date;
  capturedAt: Date;
  spotLtp: number;
  overallScore: number;
  bias: string;
  optionConviction: number;
  components: OptionChainComponentSnapshot[];
  expiresAt: Date;
}

export function isAiResponseAvailable(
  _ai: AIAnalysisResponse | undefined,
): boolean {
  return false;
}

export function buildAiOpinionStats(
  _trades: BenchmarkTradeRow[],
): BenchmarkAiOpinionStats | undefined {
  return undefined;
}