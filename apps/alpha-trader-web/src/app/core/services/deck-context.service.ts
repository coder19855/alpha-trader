import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { TradingStyle } from '../models/deck.models';
import { DeckUiActions } from '../../store/deck/deck.actions';
import {
  selectActiveTab,
  selectAppView,
  selectConnected,
  selectDeckTabs,
  selectLastPrice,
  selectLiveBadge,
  selectPriceChange,
  selectPriceChangeClass,
  selectStyle,
  selectStyleLabel,
  selectSymbol,
  selectSymbolLabel,
} from '../../store/deck/deck.selectors';

export type AppView = 'live' | 'replay' | 'benchmark';

export type DeckTab =
  | 'signal'
  | 'components'
  | 'veto'
  | 'strategy'
  | 'sizing'
  | 'charts'
  | 'events'
  | 'positions'
  | 'settings';

export interface DeckTabDef {
  id: DeckTab;
  label: string;
  icon: string;
}

export const LIVE_TABS: DeckTabDef[] = [
  { id: 'signal', label: 'Signal', icon: 'insights' },
  { id: 'veto', label: 'Veto', icon: 'block' },
  { id: 'strategy', label: 'Strategy', icon: 'psychology' },
  { id: 'sizing', label: 'Sizing', icon: 'calculate' },
  { id: 'charts', label: 'Chart', icon: 'show_chart' },
  { id: 'events', label: 'Events', icon: 'notifications' },
  { id: 'positions', label: 'Positions', icon: 'account_balance_wallet' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export const REPLAY_TABS: DeckTabDef[] = [
  { id: 'signal', label: 'Signal', icon: 'insights' },
  { id: 'veto', label: 'Veto', icon: 'block' },
  { id: 'strategy', label: 'Strategy', icon: 'psychology' },
  { id: 'sizing', label: 'Sizing', icon: 'calculate' },
  { id: 'charts', label: 'Chart', icon: 'show_chart' },
  { id: 'events', label: 'Events', icon: 'notifications' },
  { id: 'positions', label: 'Positions', icon: 'account_balance_wallet' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export const TRADING_STYLE_LABELS: Record<TradingStyle, string> = {
  INTRADAY: 'Intraday',
  SCALPER: 'Scalper',
  POSITIONAL: 'Positional',
};

export function tradingStyleLabel(style: string): string {
  const key = String(style || '').toUpperCase() as TradingStyle;
  return TRADING_STYLE_LABELS[key] ?? style;
}

/** NgRx-backed facade — keeps existing component APIs stable. */
@Injectable({ providedIn: 'root' })
export class DeckContextService {
  private readonly store = inject(Store);

  readonly appView = toSignal(this.store.select(selectAppView), {
    initialValue: 'live' as AppView,
  });
  readonly activeTab = toSignal(this.store.select(selectActiveTab), {
    initialValue: 'signal' as DeckTab,
  });
  readonly symbol = toSignal(this.store.select(selectSymbol), {
    initialValue: 'NSE:NIFTY50-INDEX',
  });
  readonly style = toSignal(this.store.select(selectStyle), {
    initialValue: 'INTRADAY' as TradingStyle,
  });
  readonly symbolLabel = toSignal(this.store.select(selectSymbolLabel), {
    initialValue: 'NIFTY',
  });
  readonly lastPrice = toSignal(this.store.select(selectLastPrice), {
    initialValue: null as number | null,
  });
  readonly priceChange = toSignal(this.store.select(selectPriceChange), {
    initialValue: '—',
  });
  readonly priceChangeClass = toSignal(
    this.store.select(selectPriceChangeClass),
    {
      initialValue: 'muted' as 'up' | 'down' | 'muted',
    },
  );
  readonly connected = toSignal(this.store.select(selectConnected), {
    initialValue: false,
  });
  readonly liveBadge = toSignal(this.store.select(selectLiveBadge), {
    initialValue: false,
  });
  readonly styleLabel = toSignal(this.store.select(selectStyleLabel), {
    initialValue: TRADING_STYLE_LABELS.INTRADAY,
  });
  readonly deckTabs = toSignal(this.store.select(selectDeckTabs), {
    initialValue: LIVE_TABS,
  });

  readonly symbols = [
    'NSE:NIFTY50-INDEX',
    'NSE:NIFTYBANK-INDEX',
    'NSE:FINNIFTY-INDEX',
    'NSE:MIDCPNIFTY-INDEX',
  ];

  setAppView(view: AppView): void {
    this.store.dispatch(
      DeckUiActions.routeSynced({ view, tab: this.activeTab() }),
    );
  }

  setTab(tab: DeckTab): void {
    this.store.dispatch(DeckUiActions.tabSelected({ tab }));
  }

  updateTracker(params: {
    symbol?: string;
    symbolLabel?: string;
    price?: number | null;
    style?: string;
    connected?: boolean;
    live?: boolean;
    asOf?: string;
  }): void {
    this.store.dispatch(DeckUiActions.trackerUpdated(params));
  }

  setSymbol(symbol: string): void {
    this.store.dispatch(DeckUiActions.symbolChanged({ symbol }));
  }

  setStyle(style: TradingStyle): void {
    this.store.dispatch(DeckUiActions.styleChanged({ style }));
  }

  shortLabel(symbol: string): string {
    return symbol.split(':')[1]?.replace('-INDEX', '') ?? symbol;
  }
}
