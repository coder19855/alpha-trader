import { createFeatureSelector, createSelector } from '@ngrx/store';
import {
  DeckTabDef,
  deckStreamStatusLabel,
  LIVE_TABS,
  REPLAY_TABS,
} from '../../core/services/deck-context.service';
import { DeckUiState } from './deck.reducer';

export const selectDeckUiState = createFeatureSelector<DeckUiState>('deckUi');

export const selectAppView = createSelector(selectDeckUiState, (s) => s.appView);
export const selectActiveTab = createSelector(selectDeckUiState, (s) => s.activeTab);
export const selectSymbol = createSelector(selectDeckUiState, (s) => s.symbol);
export const selectStyle = createSelector(selectDeckUiState, (s) => s.style);
export const selectDeckTracker = createSelector(selectDeckUiState, (s) => s.tracker);

export const selectSymbolLabel = createSelector(selectDeckTracker, (t) => t.symbolLabel);
export const selectLastPrice = createSelector(selectDeckTracker, (t) => t.lastPrice);
export const selectPriceChange = createSelector(selectDeckTracker, (t) => t.priceChange);
export const selectPriceChangeClass = createSelector(selectDeckTracker, (t) => t.priceChangeClass);
export const selectConnected = createSelector(selectDeckTracker, (t) => t.connected);
export const selectStreamStatus = createSelector(
  selectDeckTracker,
  (t) => t.streamStatus,
);
export const selectStreamStatusLabel = createSelector(selectStreamStatus, (status) =>
  deckStreamStatusLabel(status),
);
export const selectLiveBadge = createSelector(selectDeckTracker, (t) => t.liveBadge);
export const selectStyleLabel = createSelector(selectDeckTracker, (t) => t.styleLabel);

export const selectDeckTabs = createSelector(selectAppView, (view): DeckTabDef[] => {
  if (view === 'benchmark') return [];
  if (view === 'replay') return REPLAY_TABS;
  return LIVE_TABS;
});

export const selectDeckKey = createSelector(
  selectSymbol,
  selectStyle,
  (symbol, style) => `${symbol}|${style}`,
);