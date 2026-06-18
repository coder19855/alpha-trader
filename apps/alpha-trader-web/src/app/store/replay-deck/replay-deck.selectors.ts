import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ReplayDeckState } from './replay-deck.reducer';

export const selectReplayDeckState = createFeatureSelector<ReplayDeckState>('replayDeck');

export const selectReplayPayload = createSelector(selectReplayDeckState, (s) => s.payload);
export const selectReplayLoading = createSelector(selectReplayDeckState, (s) => s.loading);
export const selectReplayError = createSelector(selectReplayDeckState, (s) => s.error);
export const selectReplayScrubIndex = createSelector(selectReplayDeckState, (s) => s.scrubIndex);
export const selectReplaySessionDate = createSelector(selectReplayDeckState, (s) => s.sessionDate);

export const selectReplayScrubbedPoint = createSelector(selectReplayDeckState, (state) => {
  const points = state.payload?.replayPoints ?? [];
  if (!points.length) return null;
  const idx = Math.min(state.scrubIndex, points.length - 1);
  return points[idx];
});