import { createReducer, on } from '@ngrx/store';
import { DeckReplayPayload } from '../../core/models/deck.models';
import { ReplayDeckActions } from './replay-deck.actions';

export interface ReplayDeckState {
  payload: DeckReplayPayload | null;
  scrubIndex: number;
  loading: boolean;
  error: string | null;
  sessionDate: string;
}

export const initialReplayDeckState: ReplayDeckState = {
  payload: null,
  scrubIndex: 0,
  loading: false,
  error: null,
  sessionDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
};

export const replayDeckReducer = createReducer(
  initialReplayDeckState,
  on(ReplayDeckActions.loadRequested, (state, { sessionDate }) => ({
    ...state,
    loading: true,
    error: null,
    sessionDate,
  })),
  on(ReplayDeckActions.loadSuccess, (state, { payload }) => ({
    ...state,
    payload,
    loading: false,
    scrubIndex: Math.max(0, (payload.replayPoints?.length ?? 1) - 1),
  })),
  on(ReplayDeckActions.loadFailed, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ReplayDeckActions.scrubIndexChanged, (state, { index }) => ({
    ...state,
    scrubIndex: index,
  })),
  on(ReplayDeckActions.left, () => initialReplayDeckState),
);