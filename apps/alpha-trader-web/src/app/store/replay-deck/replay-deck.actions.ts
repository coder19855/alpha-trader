import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { DeckReplayPayload, TradingStyle } from '../../core/models/deck.models';

export const ReplayDeckActions = createActionGroup({
  source: 'Replay Deck',
  events: {
    Entered: emptyProps(),
    Left: emptyProps(),
    'Load Requested': props<{ symbol: string; style: TradingStyle; sessionDate: string }>(),
    'Load Success': props<{ payload: DeckReplayPayload }>(),
    'Load Failed': props<{ error: string }>(),
    'Scrub Index Changed': props<{ index: number }>(),
  },
});