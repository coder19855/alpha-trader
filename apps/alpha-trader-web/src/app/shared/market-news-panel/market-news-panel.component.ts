import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { DeckApiService } from '../../core/services/deck-api.service';
import { MarketNewsPayload } from '../../core/models/deck.models';

@Component({
  selector: 'app-market-news-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="news-panel">
      <div class="news-head">
        <span>Market news</span>
        <div class="news-meta">
          @if (payload()?.fetchedAt) {
            <small>Updated {{ formatFetchedAt(payload()!.fetchedAt) }}</small>
          }
          <button type="button" class="news-reload" (click)="reload()" [disabled]="loading()">
            {{ loading() ? 'Loading…' : '↻ Reload' }}
          </button>
        </div>
      </div>
      @if (error()) {
        <p class="news-err">{{ error() }}</p>
      }
      @if (loading() && !payload()?.items?.length) {
        <p class="news-muted">Fetching headlines…</p>
      }
      <ul class="news-list">
        @for (item of payload()?.items ?? []; track item.id) {
          <li>
            <a [href]="item.link" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
            <small>
              @if (item.source) { {{ item.source }} · }
              {{ item.publishedAt ? formatPublished(item.publishedAt) : 'Recent' }}
            </small>
          </li>
        }
      </ul>
      @if (!loading() && !(payload()?.items?.length)) {
        <p class="news-muted">No headlines returned for this symbol.</p>
      }
    </section>
  `,
  styles: [
    `
      .news-panel { padding: 8px 4px; }
      .news-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 10px;
        font-weight: 700;
        font-size: 0.85rem;
      }
      .news-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .news-meta small { color: var(--muted); font-size: 0.68rem; }
      .news-reload {
        padding: 4px 10px;
        font-size: 0.7rem;
        border-radius: 6px;
        border: 1px solid rgba(34, 211, 238, 0.4);
        background: rgba(34, 211, 238, 0.1);
        color: #22d3ee;
        cursor: pointer;
      }
      .news-reload:disabled { opacity: 0.6; }
      .news-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .news-list a {
        color: #e8ecf1;
        text-decoration: none;
        font-size: 0.82rem;
        line-height: 1.35;
      }
      .news-list a:hover { color: #22d3ee; }
      .news-list small {
        display: block;
        margin-top: 2px;
        color: var(--muted);
        font-size: 0.65rem;
      }
      .news-err { color: #f87171; font-size: 0.75rem; }
      .news-muted { color: var(--muted); font-size: 0.75rem; }
    `,
  ],
})
export class MarketNewsPanelComponent implements OnInit, OnDestroy {
  private readonly api = inject(DeckApiService);
  private sub: Subscription | null = null;
  private symbolValue = 'NSE:NIFTY50-INDEX';

  @Input() set symbol(value: string | null | undefined) {
    this.symbolValue = value?.trim() || 'NSE:NIFTY50-INDEX';
    if (this.active) this.startPolling();
  }

  @Input() set tabActive(active: boolean) {
    this.active = active;
    if (active) {
      this.startPolling();
    } else {
      this.sub?.unsubscribe();
      this.sub = null;
    }
  }

  private active = false;

  readonly payload = signal<MarketNewsPayload | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.active) this.startPolling();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  reload(): void {
    this.fetch(true);
  }

  formatFetchedAt(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '—';
    return at.toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    }) + ' IST';
  }

  formatPublished(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '—';
    return at.toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    });
  }

  private startPolling(): void {
    this.sub?.unsubscribe();
    this.fetch(false);
    this.sub = interval(120_000).subscribe(() => this.fetch(false));
  }

  private fetch(refresh: boolean): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getNews(this.symbolValue, refresh).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.payload.set(res);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.error || err?.message || 'News fetch failed');
      },
    });
  }
}