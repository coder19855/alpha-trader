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
import { TradeJournalEntry } from '../../core/models/deck.models';

@Component({
  selector: 'app-trade-journal-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="journal-panel">
      <div class="journal-head">
        <span>Trade journal</span>
        @if (fetchedAt(); as at) {
          <small>Updated {{ formatFetchedAt(at) }}</small>
        }
      </div>
      <p class="journal-hint">
        Entries are written when Fyers open positions are detected (deck tick or guard poll).
        Requires MongoDB on the server. Option trigger may update on the next sync after entry.
      </p>
      @if (error()) {
        <p class="journal-err">{{ error() }}</p>
      }
      <div class="journal-list">
        @for (row of entries(); track row.id) {
          <article class="journal-row" [class.open]="row.status === 'open'">
            <header>
              <span class="side" [class.ce]="row.side === 'CE'" [class.pe]="row.side === 'PE'">
                {{ row.side }}
              </span>
              <span class="status">{{ row.status }}</span>
            </header>
            <p class="dates">
              <span>Entered {{ formatFetchedAt(row.entryAt) }}</span>
              @if (row.exitAt) {
                <span> · Exited {{ formatFetchedAt(row.exitAt) }}</span>
              }
            </p>
            @if (row.paTrigger) {
              <p class="trigger"><strong>PA:</strong> {{ row.paTrigger }}</p>
            }
            <p class="trigger">
              <strong>Option:</strong>
              @if (row.optionTrigger) {
                {{ row.optionTrigger }}
              } @else if (row.optionTriggerPending) {
                <span class="pending">Pending…</span>
              } @else {
                —
              }
            </p>
            @if (row.entryNote) {
              <p class="note">{{ row.entryNote }}</p>
            }
          </article>
        }
      </div>
      @if (!entries().length && !error()) {
        <p class="journal-muted">No journal entries yet — open a position to start tracking.</p>
      }
    </section>
  `,
  styles: [
    `
      .journal-panel { padding: 8px 4px; }
      .journal-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-weight: 700;
        font-size: 0.85rem;
        margin-bottom: 6px;
      }
      .journal-head small { color: var(--muted); font-size: 0.68rem; font-weight: 400; }
      .journal-hint { color: var(--muted); font-size: 0.68rem; margin: 0 0 10px; }
      .journal-list { display: flex; flex-direction: column; gap: 10px; }
      .journal-row {
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.2);
      }
      .journal-row.open { border-color: rgba(34, 211, 238, 0.35); }
      .journal-row header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .side {
        font-weight: 800;
        font-size: 0.75rem;
        text-transform: uppercase;
      }
      .side.ce { color: var(--oc-call, #38bdf8); }
      .side.pe { color: var(--oc-put, #c4b5fd); }
      .status {
        font-size: 0.62rem;
        text-transform: uppercase;
        color: var(--muted);
      }
      .dates, .trigger, .note {
        margin: 0 0 4px;
        font-size: 0.72rem;
        line-height: 1.4;
      }
      .trigger .pending { color: #fbbf24; font-style: italic; }
      .note { color: var(--muted); font-size: 0.65rem; }
      .journal-err { color: #f87171; font-size: 0.75rem; }
      .journal-muted { color: var(--muted); font-size: 0.75rem; }
    `,
  ],
})
export class TradeJournalListComponent implements OnInit, OnDestroy {
  private readonly api = inject(DeckApiService);
  private pollSub: Subscription | null = null;
  private requestSub: Subscription | null = null;
  private symbolValue: string | undefined;

  @Input() set symbol(value: string | null | undefined) {
    this.symbolValue = value?.trim() || undefined;
    if (this.active) this.load();
  }

  @Input() set tabActive(active: boolean) {
    this.active = active;
    if (active) {
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }

  private active = false;

  readonly entries = signal<TradeJournalEntry[]>([]);
  readonly fetchedAt = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.active) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
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

  private load(): void {
    this.error.set(null);
    this.requestSub?.unsubscribe();
    this.requestSub = this.api.getJournal(this.symbolValue).subscribe({
      next: (res) => {
        this.entries.set(res.entries);
        this.fetchedAt.set(res.fetchedAt);
      },
      error: (err) => {
        this.error.set(err?.error?.error || err?.message || 'Journal fetch failed');
      },
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.load();
    this.pollSub = interval(60_000).subscribe(() => this.load());
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
    this.requestSub?.unsubscribe();
    this.requestSub = null;
  }
}