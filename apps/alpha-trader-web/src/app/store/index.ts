import { isDevMode } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideRouterStore, routerReducer } from '@ngrx/router-store';
import { provideState, provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { deckUiReducer } from './deck/deck.reducer';
import { DeckRouterEffects } from './deck/deck.effects';
import { liveDeckReducer } from './live-deck/live-deck.reducer';
import { LiveDeckEffects } from './live-deck/live-deck.effects';
import { replayDeckReducer } from './replay-deck/replay-deck.reducer';
import { ReplayDeckEffects } from './replay-deck/replay-deck.effects';

export interface AppState {
  router: ReturnType<typeof routerReducer>;
  deckUi: ReturnType<typeof deckUiReducer>;
  liveDeck: ReturnType<typeof liveDeckReducer>;
  replayDeck: ReturnType<typeof replayDeckReducer>;
}

export const appStoreProviders = [
  provideStore({ router: routerReducer }),
  provideRouterStore(),
  provideState('deckUi', deckUiReducer),
  provideState('liveDeck', liveDeckReducer),
  provideState('replayDeck', replayDeckReducer),
  provideEffects(DeckRouterEffects, LiveDeckEffects, ReplayDeckEffects),
  provideStoreDevtools({
    maxAge: 50,
    logOnly: !isDevMode(),
    autoPause: true,
  }),
];