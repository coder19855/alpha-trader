import { createFeatureSelector, createSelector } from '@ngrx/store';
import { liveTickAdapter, LiveDeckState } from './live-deck.reducer';
import { selectDeckKey } from '../deck/deck.selectors';

export const selectLiveDeckState = createFeatureSelector<LiveDeckState>('liveDeck');

const { selectEntities, selectAll } = liveTickAdapter.getSelectors(selectLiveDeckState);

export const selectLiveTickEntities = selectEntities;
export const selectAllLiveTicks = selectAll;

export const selectActiveLiveTick = createSelector(
  selectLiveDeckState,
  selectDeckKey,
  (state, deckKey) => state.entities[deckKey] ?? null,
);

export const selectLiveDeckLoading = createSelector(
  selectLiveDeckState,
  selectDeckKey,
  (state, deckKey) => state.loadingKeys.includes(deckKey),
);

export const selectLiveDeckError = createSelector(
  selectLiveDeckState,
  selectDeckKey,
  (state, deckKey) => state.errorByKey[deckKey] ?? null,
);

export const selectLiveDeckSettings = createSelector(selectLiveDeckState, (s) => s.settings);