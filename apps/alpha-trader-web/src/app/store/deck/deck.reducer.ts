import { createReducer, on } from '@ngrx/store';
import { TradingStyle } from '../../core/models/deck.models';
import {
  AppView,
  DeckStreamStatus,
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
  streamStatus: DeckStreamStatus;
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
  streamStatus: 'disconnected',
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
      connected: false,
      streamStatus: 'disconnected' as const,
      liveBadge: false,
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

    if (params.streamStatus !== undefined) {
      tracker.streamStatus = params.streamStatus;
      tracker.connected = params.streamStatus === 'live';
      tracker.liveBadge = params.streamStatus === 'live';
    } else {
      if (params.connected !== undefined) {
        tracker.connected = params.connected;
        tracker.streamStatus = params.connected ? 'live' : 'disconnected';
      }
      if (params.live !== undefined) tracker.liveBadge = params.live;
    }

    if (params.price != null && !Number.isNaN(Number(params.price))) {
      tracker.lastPrice = Number(params.price);
    }

    const hasDayDelta = params.dayChange !== undefined;
    const hasDayPct = params.dayChangePct !== undefined;
    if (hasDayDelta && hasDayPct) {
      const dayDelta = Number(params.dayChange);
      const dayPct = Number(params.dayChangePct);
      if (!Number.isNaN(dayDelta) && !Number.isNaN(dayPct)) {
        const sign = dayDelta >= 0 ? '+' : '';
        tracker.priceChange = `${sign}${dayDelta.toFixed(2)} (${sign}${dayPct.toFixed(2)}%)`;
        tracker.priceChangeClass =
          dayDelta > 0 ? 'up' : dayDelta < 0 ? 'down' : 'muted';
      }
    }

    return { ...state, symbol, style, tracker };
  }),
);