import { Injectable, signal } from '@angular/core';

export type DeckTheme =
  | 'midnight'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'slate'
  | 'amethyst'
  | 'paper';

const STORAGE_KEY = 'alpha-deck-theme';
const THEMES: DeckTheme[] = [
  'midnight',
  'ocean',
  'forest',
  'sunset',
  'slate',
  'amethyst',
  'paper',
];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themes = THEMES;
  readonly active = signal<DeckTheme>(this.loadStored());

  constructor() {
    this.apply(this.active());
  }

  apply(theme: DeckTheme): void {
    const next = THEMES.includes(theme) ? theme : 'midnight';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.classList.add('web-layout');
    this.active.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  private loadStored(): DeckTheme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as DeckTheme | null;
      if (stored && THEMES.includes(stored)) return stored;
    } catch {
      /* ignore */
    }
    return 'midnight';
  }
}