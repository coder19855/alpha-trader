import { RrLabel } from '../types/technical-analysis.js';

/** Live engine + benchmark RR ladder (matches getConfluentTradeSignal). */
export const LIVE_TRADE_RR_LABELS: RrLabel[] = ['1:1.5', '1:2.5', '1:4'];

export const LIVE_TRADE_RR_MULTIPLIERS = [1.5, 2.5, 4] as const;

export const LIVE_TRADE_RR_ORDER: RrLabel[] = [...LIVE_TRADE_RR_LABELS];

/** Replay flip polls use 5m engine reads (2 polls ≈ 10m confirm window). */
export const FLIP_POLL_INTERVAL_MINUTES = 5;

/** Once past 1:4, trail floor ratchets at peakR − this (e.g. 7R peak → 6R floor). */
export const TRAIL_GIVEBACK_R = 1;

/** Move SL to Break-Even (0R) once peak reaches this R. */
export const EARLY_BE_LOCK_R = 1.0;

/** Flip exit and profit-protection rules engage once peak reaches this R. */
export const FLIP_EXIT_MIN_PEAK_R = 1;

/** In the last N minutes before 15:30 IST, fade protection can exit open winners. */
export const SESSION_END_TIGHTEN_MINUTES = 45;

/** Session-end tighten: peak must have reached at least this R. */
export const SESSION_END_TIGHTEN_PEAK_R = 1;

/** Session-end tighten: exit at market when spot fades to this R or below. */
export const SESSION_END_TIGHTEN_CURRENT_R = 0.5;