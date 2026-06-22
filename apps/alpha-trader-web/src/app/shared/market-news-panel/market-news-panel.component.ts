import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  computed,
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
      <div class="news-shell">
        <div class="news-head">
          <div class="news-head-copy">
            <p class="news-kicker">Market news</p>
            <h3>Latest headlines</h3>
            <p class="news-subtle">Sorted newest to oldest for quick scanning.</p>
          </div>
          <div class="news-actions">
            <span class="news-chip">Live feed</span>
            <button
              type="button"
              class="news-reload"
              (click)="reload()"
              [disabled]="loading()"
            >
              {{ loading() ? 'Refreshing…' : '↻ Refresh' }}
            </button>
          </div>
        </div>

        @if (error()) {
          <p class="news-err">{{ error() }}</p>
        }

        @if (loading() && !items().length) {
          <div class="news-loading">
            <div class="news-skeleton"></div>
            <div class="news-skeleton"></div>
            <div class="news-skeleton"></div>
          </div>
        }

        @if (items().length) {
          <div class="news-summary">
            <span>{{ items().length }} headlines</span>
            @if (payload()?.fetchedAt) {
              <span>Updated {{ formatFetchedAt(payload()!.fetchedAt) }}</span>
            }
          </div>

          @if (items()[0]; as lead) {
            <article class="news-featured">
              <div class="news-featured-top">
                <span class="news-featured-tag">Top story</span>
                @if (lead.source) {
                  <span class="news-source">{{ lead.source }}</span>
                }
              </div>
              <a
                class="news-featured-title"
                [href]="lead.link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ lead.title }}
              </a>
              <div class="news-featured-meta">
                <span>{{ lead.publishedAt ? formatRelative(lead.publishedAt) : 'Just published' }}</span>
                <span class="news-dot">•</span>
                <span>{{ lead.publishedAt ? formatPublished(lead.publishedAt) : 'Recent' }}</span>
              </div>
            </article>
          }

          @if (items().length > 1) {
            <div class="news-list">
              @for (item of items().slice(1); track item.id) {
                <article class="news-card">
                  <a
                    class="news-link"
                    [href]="item.link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ item.title }}
                  </a>
                  <div class="news-card-meta">
                    @if (item.source) {
                      <span class="news-source">{{ item.source }}</span>
                    }
                    <span>{{ item.publishedAt ? formatRelative(item.publishedAt) : 'Recent' }}</span>
                  </div>
                </article>
              }
            </div>
          }
        } @else if (!loading()) {
          <div class="news-empty">
            <p>No headlines returned for this symbol.</p>
            <span>Try refreshing or check back in a few minutes.</span>
          </div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .news-panel {
        padding: 8px 4px;
      }
      .news-shell {
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.76));
        box-shadow: 0 18px 48px rgba(2, 6, 23, 0.28);
        padding: 16px;
      }
      .news-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
      }
      .news-head-copy h3 {
        margin: 2px 0 4px;
        font-size: 1rem;
        line-height: 1.2;
      }
      .news-kicker {
        margin: 0;
        color: #22d3ee;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .news-subtle {
        margin: 0;
        color: var(--muted);
        font-size: 0.75rem;
      }
      .news-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .news-chip,
      .news-reload {
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 0.72rem;
        line-height: 1;
      }
      .news-chip {
        border: 1px solid rgba(34, 211, 238, 0.28);
        background: rgba(34, 211, 238, 0.08);
        color: #67e8f9;
      }
      .news-reload {
        border: 1px solid rgba(34, 211, 238, 0.4);
        background: rgba(34, 211, 238, 0.12);
        color: #a5f3fc;
        cursor: pointer;
      }
      .news-reload:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .news-summary {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
        color: var(--muted);
        font-size: 0.72rem;
      }
      .news-summary span {
        padding: 5px 9px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.08);
        border: 1px solid rgba(148, 163, 184, 0.12);
      }
      .news-featured {
        padding: 14px;
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(8, 47, 73, 0.88), rgba(15, 23, 42, 0.92));
        border: 1px solid rgba(34, 211, 238, 0.18);
        margin-bottom: 12px;
      }
      .news-featured-top,
      .news-card-meta {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .news-featured-top {
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .news-featured-tag,
      .news-source {
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 0.68rem;
        color: #c4f1ff;
        background: rgba(34, 211, 238, 0.12);
        border: 1px solid rgba(34, 211, 238, 0.18);
      }
      .news-featured-title,
      .news-link {
        color: #f8fafc;
        text-decoration: none;
      }
      .news-featured-title {
        display: block;
        font-size: 0.96rem;
        font-weight: 700;
        line-height: 1.45;
      }
      .news-featured-title:hover,
      .news-link:hover {
        color: #67e8f9;
      }
      .news-featured-meta,
      .news-card-meta {
        margin-top: 8px;
        color: var(--muted);
        font-size: 0.68rem;
      }
      .news-dot {
        opacity: 0.6;
      }
      .news-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .news-card {
        padding: 12px 13px;
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.12);
        transition:
          transform 140ms ease,
          border-color 140ms ease,
          background 140ms ease;
      }
      .news-card:hover {
        transform: translateY(-1px);
        border-color: rgba(34, 211, 238, 0.24);
        background: rgba(15, 23, 42, 0.9);
      }
      .news-link {
        display: block;
        font-size: 0.84rem;
        line-height: 1.45;
      }
      .news-loading,
      .news-empty {
        display: grid;
        gap: 10px;
      }
      .news-empty {
        padding: 12px;
        color: var(--muted);
        font-size: 0.78rem;
      }
      .news-empty p {
        margin: 0;
        color: #e2e8f0;
      }
      .news-empty span {
        color: var(--muted);
      }
      .news-skeleton {
        height: 64px;
        border-radius: 14px;
        background: linear-gradient(
          90deg,
          rgba(148, 163, 184, 0.08),
          rgba(148, 163, 184, 0.16),
          rgba(148, 163, 184, 0.08)
        );
        background-size: 200% 100%;
        animation: news-shimmer 1.4s ease-in-out infinite;
      }
      .news-err { color: #f87171; font-size: 0.75rem; }
      @keyframes news-shimmer {
        0% { background-position: 0% 0; }
        100% { background-position: 200% 0; }
      }
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
  readonly items = computed(() => {
    const items = this.payload()?.items ?? [];
    return [...items].sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : -Infinity;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : -Infinity;
      if (aTime !== bTime) return bTime - aTime;
      return a.title.localeCompare(b.title);
    });
  });

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

  formatRelative(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return 'Recent';
    const diffMs = Date.now() - at.getTime();
    const diffMins = Math.max(0, Math.round(diffMs / 60_000));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
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