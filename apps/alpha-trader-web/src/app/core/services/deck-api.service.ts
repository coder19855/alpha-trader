import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AutoEntrySnapshot,
  AutoExitSnapshot,
  DeckLiveTick,
  DeckReplayPayload,
  MarketNewsPayload,
  SettingsSnapshot,
  TradeJournalEntry,
  TradingStyle,
  WebSession,
} from '../models/deck.models';

export interface DeckLiveBootstrapPayload {
  symbol: string;
  symbolLabel: string;
  lastPrice: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  asOf: string;
}

@Injectable({ providedIn: 'root' })
export class DeckApiService {
  private readonly http = inject(HttpClient);

  getSession(page?: string): Observable<WebSession> {
    const query = page ? `?page=${page}` : '';
    return this.http.get<WebSession>(`/api/web/session${query}`);
  }

  getLive(symbol: string, style: TradingStyle, scope?: 'fast' | 'enrichment') {
    const params = new URLSearchParams({ symbol, style });
    if (scope) params.set('scope', scope);
    return this.http.get<DeckLiveTick>(`/api/deck/live?${params}`);
  }

  getLiveBootstrap(symbol: string, style: TradingStyle) {
    const params = new URLSearchParams({ symbol, style, scope: 'bootstrap' });
    return this.http.get<DeckLiveBootstrapPayload>(`/api/deck/live?${params}`);
  }

  getReplay(symbol: string, style: TradingStyle, date?: string) {
    const params = new URLSearchParams({ symbol, style });
    if (date) params.set('date', date);
    return this.http.get<DeckReplayPayload>(`/api/deck/replay?${params}`);
  }

  getReplayTrades(symbol: string, style: TradingStyle, date: string) {
    const params = new URLSearchParams({ symbol, style, date });
    return this.http.get<{ trades: unknown[]; pnlSeries: Array<{ t: number; v: number }>; pnlNote?: string }>(
      `/api/deck/replay-trades?${params}`,
    );
  }

  getSettings() {
    return this.http.get<SettingsSnapshot>('/api/deck/settings');
  }

  patchSettings(patch: Record<string, string>) {
    return this.http.patch<SettingsSnapshot>('/api/deck/settings', patch);
  }

  getAutoExit() {
    return this.http.get<AutoExitSnapshot>('/api/deck/auto-exit');
  }

  patchAutoExit(patch: Partial<AutoExitSnapshot>) {
    return this.http.patch<AutoExitSnapshot>('/api/deck/auto-exit', patch);
  }

  getAutoEntry() {
    return this.http.get<AutoEntrySnapshot>('/api/deck/auto-entry');
  }

  patchAutoEntry(patch: Partial<AutoEntrySnapshot>) {
    return this.http.patch<AutoEntrySnapshot>('/api/deck/auto-entry', patch);
  }

  getNews(symbol: string, refresh = false) {
    const params = new URLSearchParams({ symbol });
    if (refresh) params.set('refresh', 'true');
    return this.http.get<MarketNewsPayload>(`/api/deck/news?${params}`);
  }

  getJournal(symbol?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (symbol) params.set('symbol', symbol);
    return this.http.get<{ entries: TradeJournalEntry[]; fetchedAt: string }>(
      `/api/deck/journal?${params}`,
    );
  }

  getFunds() {
    return this.http.get<{ available: number; title?: string; raw?: any[] }>('/api/deck/funds');
  }
}