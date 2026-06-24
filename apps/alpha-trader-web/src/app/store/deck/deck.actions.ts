import { createActionGroup, props } from '@ngrx/store';
import { TradingStyle } from '../../core/models/deck.models';
import {
  AppView,
  DeckTab,
  DeckStreamStatus,
} from '../../core/services/deck-context.service';

export const DeckUiActions = createActionGroup({
  source: 'Deck UI',
  events: {
    'Route Synced': props<{ view: AppView; tab: DeckTab }>(),
    'Tab Selected': props<{ tab: DeckTab }>(),
    'Symbol Changed': props<{ symbol: string }>(),
    'Style Changed': props<{ style: TradingStyle }>(),
    'Tracker Updated': props<{
      symbol?: string;
      symbolLabel?: string;
      price?: number | null;
      dayChange?: number | null;
      dayChangePct?: number | null;
      style?: string;
      connected?: boolean;
      streamStatus?: DeckStreamStatus;
      live?: boolean;
      asOf?: string;
    }>(),
  },
});