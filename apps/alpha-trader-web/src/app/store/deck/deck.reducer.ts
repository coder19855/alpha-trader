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
  lastUpdated: string;
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
  lastUpdated: '—',
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
    if (params.asOf) {
      tracker.lastUpdated = new Date(params.asOf).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }

    if (params.price != null && !Number.isNaN(Number(params.price))) {
      const price = Number(params.price);
      const prev = tracker.lastPrice;
      if (prev != null) {
        const delta = price - prev;
        const pct = prev ? (delta / prev) * 100 : 0;
        const sign = delta >= 0 ? '+' : '';
        tracker.priceChange = `${sign}${delta.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
        tracker.priceChangeClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted';
      } else {
        tracker.priceChange = params.style || '—';
        tracker.priceChangeClass = 'muted';
      }
      tracker.lastPrice = price;
    }

    return { ...state, symbol, style, tracker };
  }),
);