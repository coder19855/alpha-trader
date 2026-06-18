import { DeckTab } from '../services/deck-context.service';

export type DeckAppView = 'live' | 'replay';

export const DECK_TAB_IDS: DeckTab[] = [
  'signal',
  'components',
  'veto',
  'strategy',
  'charts',
  'events',
  'positions',
  'settings',
];

export function isDeckTab(value: string | undefined): value is DeckTab {
  return Boolean(value && DECK_TAB_IDS.includes(value as DeckTab));
}

export function defaultDeckTab(): DeckTab {
  return 'signal';
}

export function deckRouteSegments(view: DeckAppView, tab: DeckTab = 'signal'): string[] {
  return view === 'replay' ? ['/replay', tab] : ['/live', tab];
}

export function parseDeckRoute(url: string): {
  view: DeckAppView | 'benchmark' | 'login' | 'other';
  tab: DeckTab;
} {
  const path = url.split('?')[0];
  if (path.startsWith('/login')) return { view: 'login', tab: defaultDeckTab() };
  if (path.startsWith('/benchmark')) return { view: 'benchmark', tab: defaultDeckTab() };
  if (path.startsWith('/replay')) {
    const tab = path.split('/')[2];
    return { view: 'replay', tab: isDeckTab(tab) ? tab : defaultDeckTab() };
  }
  if (path.startsWith('/live') || path === '/') {
    const tab = path === '/' || path === '/live' ? undefined : path.split('/')[2];
    return { view: 'live', tab: isDeckTab(tab) ? tab : defaultDeckTab() };
  }
  return { view: 'other', tab: defaultDeckTab() };
}

export function deckKey(symbol: string, style: string): string {
  return `${symbol}|${style}`;
}