import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { DeckLiveTick, SettingsSnapshot, TradingStyle } from '../../core/models/deck.models';

export const LiveDeckActions = createActionGroup({
  source: 'Live Deck',
  events: {
    Entered: emptyProps(),
    Left: emptyProps(),
    'Load Started': props<{ symbol: string; style: TradingStyle }>(),
    'Fast Tick Received': props<{ deckKey: string; tick: DeckLiveTick }>(),
    'Chart Patch Received': props<{ deckKey: string; patch: Partial<DeckLiveTick> }>(),
    'Tick Merged': props<{ deckKey: string; tick: DeckLiveTick }>(),
    'Load Failed': props<{ deckKey: string; error: string }>(),
    'Settings Loaded': props<{ settings: SettingsSnapshot }>(),
    'Settings Updated': props<{ settings: SettingsSnapshot }>(),
    Retry: emptyProps(),
  },
});