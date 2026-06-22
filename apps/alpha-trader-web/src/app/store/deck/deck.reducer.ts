import { createReducer, on } from '@ngrx/store';
import { TradingStyle } from '../../core/models/deck.models';
import {
  AppView,
  DeckTab,
  TRADING_STYLE_LABELS,
  tradingStyleLabel,
} from '../../core/services/deck-context.service';
import { DeckUiActions } from './deck.actions';

export interface DeckTrackerState {
  symbolLabel: string;
  lastPrice: number | null;
  priceChange: string;
  priceChangeClass: 'up' | 'down' | 'muted';
  connected: boolean;
  liveBadge: boolean;
  styleLabel: string;
}

export interface DeckUiState {
  appView: AppView;
  activeTab: DeckTab;
  symbol: string;
  style: TradingStyle;
  tracker: DeckTrackerState;
}

export const initialDeckTrackerState: DeckTrackerState = {
  symbolLabel: 'NIFTY',
  lastPrice: null,
  priceChange: '—',
  priceChangeClass: 'muted',
  connected: false,
  liveBadge: false,
  styleLabel: TRADING_STYLE_LABELS.INTRADAY,
};

export const initialDeckUiState: DeckUiState = {
  appView: 'live',
  activeTab: 'signal',
  symbol: 'NSE:NIFTY50-INDEX',
  style: 'INTRADAY',
  tracker: initialDeckTrackerState,
};

function shortLabel(symbol: string): string {
  return symbol.split(':')[1]?.replace('-INDEX', '') ?? symbol;
}

export const deckUiReducer = createReducer(
  initialDeckUiState,
  on(DeckUiActions.routeSynced, (state, { view, tab }) => ({
    ...state,
    appView: view,
    activeTab: tab,
  })),
  on(DeckUiActions.tabSelected, (state, { tab }) => ({
    ...state,
    activeTab: tab,
  })),
  on(DeckUiActions.symbolChanged, (state, { symbol }) => ({
    ...state,
    symbol,
    tracker: {
      ...state.tracker,
      symbolLabel: shortLabel(symbol),
      lastPrice: null,
      priceChange: '—',
      priceChangeClass: 'muted' as const,
    },
  })),
  on(DeckUiActions.styleChanged, (state, { style }) => ({
    ...state,
    style,
    tracker: {
      ...state.tracker,
      styleLabel: tradingStyleLabel(style),
    },
  })),
  on(DeckUiActions.trackerUpdated, (state, params) => {
    const tracker = { ...state.tracker };
    let symbol = state.symbol;
    let style = state.style;

    if (params.symbol) {
      symbol = params.symbol;
      tracker.symbolLabel = params.symbolLabel ?? shortLabel(params.symbol);
    } else if (params.symbolLabel) {
      tracker.symbolLabel = params.symbolLabel;
    }

    if (params.style) {
      style = params.style as TradingStyle;
      tracker.styleLabel = tradingStyleLabel(params.style);
    }

    if (params.connected !== undefined) tracker.connected = params.connected;
    if (params.live !== undefined) tracker.liveBadge = params.live;

    if (params.price != null && !Number.isNaN(Number(params.price))) {
      tracker.lastPrice = Number(params.price);
    }

    const dayDelta =
      params.dayChange != null && !Number.isNaN(Number(params.dayChange))
        ? Number(params.dayChange)
        : null;
    const dayPct =
      params.dayChangePct != null && !Number.isNaN(Number(params.dayChangePct))
        ? Number(params.dayChangePct)
        : null;

    if (dayDelta != null && dayPct != null) {
      const sign = dayDelta >= 0 ? '+' : '';
      tracker.priceChange = `${sign}${dayDelta.toFixed(2)} (${sign}${dayPct.toFixed(2)}%)`;
      tracker.priceChangeClass =
        dayDelta > 0 ? 'up' : dayDelta < 0 ? 'down' : 'muted';
    } else if (params.price != null && tracker.lastPrice != null) {
      tracker.priceChange = '—';
      tracker.priceChangeClass = 'muted';
    }

    return { ...state, symbol, style, tracker };
  }),
);