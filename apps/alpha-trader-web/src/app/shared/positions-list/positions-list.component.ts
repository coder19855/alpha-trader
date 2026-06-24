import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  DeckOpenPositionEntry,
  DeckPositionRrTracker,
} from '../../core/models/deck.models';
import { PositionRrTrackerComponent } from '../position-rr-tracker/position-rr-tracker.component';

@Component({
  selector: 'app-positions-list',
  standalone: true,
  imports: [CommonModule, PositionRrTrackerComponent],
  template: `
    <section class="positions-panel">
      <div class="panel-head">
        <span>Open entries</span>
        <span class="panel-note">{{ entries.length ? entries.length + ' leg(s)' : '—' }}</span>
      </div>

      @if (note) {
        <p class="positions-note" role="status">{{ note }}</p>
      }

      @if (rrTracker) {
        <app-position-rr-tracker
          [rrTracker]="rrTracker"
          [trailStopPrice]="trailStopPrice"
          [trailStopLabel]="trailStopLabel"
        />
      }

      @if (!entries.length) {
        <p class="muted" style="font-size: 0.78rem">No open positions</p>
      } @else {
        <div class="positions-list">
          @for (entry of entries; track entry.symbol) {
            <article class="position-card" [class.watched]="entry.isWatchedIndex">
              <div class="position-card-head">
                <div>
                  <div class="position-symbol">{{ entry.optionLabel || entry.symbol }}</div>
                  @if (entry.indexLabel) {
                    <div class="position-index">{{ entry.indexLabel }}</div>
                  }
                </div>
                <div class="position-pnl" [class]="pnlClass(entry)">
                  {{ formatPnl(entry) }}
                </div>
              </div>

              <div class="position-meta-row">
                <span
                  class="position-pill"
                  [class.ce]="direction(entry) === 'CE-BUY'"
                  [class.pe]="direction(entry) === 'PE-BUY'"
                >
                  {{ direction(entry) }}
                </span>
                @if (entry.isWatchedIndex) {
                  <span class="position-pill good">Watched</span>
                }
                @if (entry.moneyness) {
                  <span class="position-pill">{{ entry.moneyness }}</span>
                }
              </div>

              <div class="position-stats">
                <div class="position-stat">
                  Qty<strong>{{ qty(entry) }}</strong>
                </div>
                <div class="position-stat">
                  Strike<strong>{{ entry.strike ?? '—' }}</strong>
                </div>
                <div class="position-stat">
                  Avg<strong>{{ avg(entry) }}</strong>
                </div>
                <div class="position-stat">
                  LTP<strong>{{ ltp(entry) }}</strong>
                </div>
                <div class="position-stat">
                  Spot<strong>{{ spot(entry) }}</strong>
                </div>
              </div>
            </article>
          }
        </div>
      }

      @if (advice) {
        <p class="status-line">{{ advice }}</p>
      }
    </section>
  `,
})
export class PositionsListComponent {
  @Input() entries: DeckOpenPositionEntry[] = [];
  @Input() note: string | null | undefined;
  @Input() advice: string | null | undefined;
  @Input() rrTracker: DeckPositionRrTracker | null | undefined;
  @Input() trailStopPrice: number | null | undefined;
  @Input() trailStopLabel: string | null | undefined;

  direction(entry: DeckOpenPositionEntry): string {
    return entry.direction || entry.side || '—';
  }

  qty(entry: DeckOpenPositionEntry): string {
    const net = entry.netQty ?? entry.qty;
    if (net == null) return '—';
    const lots = entry.lots != null ? ` (${entry.lots} lots)` : '';
    return `${net}${lots}`;
  }

  avg(entry: DeckOpenPositionEntry): string {
    const avg = entry.buyAvg ?? entry.avgPrice;
    return avg && avg > 0 ? `₹${avg.toFixed(2)}` : '—';
  }

  ltp(entry: DeckOpenPositionEntry): string {
    return entry.ltp != null ? `₹${entry.ltp.toFixed(2)}` : '—';
  }

  spot(entry: DeckOpenPositionEntry): string {
    return entry.spot != null ? entry.spot.toFixed(2) : '—';
  }

  pnlValue(entry: DeckOpenPositionEntry): number | null {
    const pnl = entry.unrealizedPnl ?? entry.pnlInr;
    return pnl != null && Number.isFinite(pnl) ? pnl : null;
  }

  formatPnl(entry: DeckOpenPositionEntry): string {
    const pnl = this.pnlValue(entry);
    if (pnl == null) return '—';
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}₹${Math.abs(pnl).toFixed(0)}`;
  }

  pnlClass(entry: DeckOpenPositionEntry): string {
    const pnl = this.pnlValue(entry);
    if (pnl == null) return '';
    if (pnl > 0) return 'up';
    if (pnl < 0) return 'down';
    return '';
  }
}