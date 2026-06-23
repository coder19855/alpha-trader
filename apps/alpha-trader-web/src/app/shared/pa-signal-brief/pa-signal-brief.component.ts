import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import {
  DeckGaugeReading,
  DeckLiveTick,
  DeckMarketRegime,
  DeckTradeSetup,
  PaDrilldown,
} from '../../core/models/deck.models';
import { formatSignalCalculatedAt } from '../../core/utils/format-signal-timestamp';
import {
  buildPaBrief,
  PaBriefSnapshot,
} from './pa-signal-brief.utils';

@Component({
  selector: 'app-pa-signal-brief',
  standalone: true,
  template: `
    <section class="pa-signal-brief" aria-label="Price action brief">
      @if (current(); as brief) {
        <article class="pa-brief-current">
          <header class="pa-brief-head">
            <span class="pa-brief-action" [class]="actionTone(brief.actionLabel)">
              {{ brief.actionLabel }}
            </span>
            <time class="pa-brief-stamp" [attr.datetime]="brief.updatedAt">
              {{ formatAt(brief.updatedAt) }}
            </time>
          </header>
          <h3 class="pa-brief-headline">{{ brief.headline }}</h3>
          <p class="pa-brief-summary">{{ brief.summary }}</p>
          @if (brief.bullets.length) {
            <ul class="pa-brief-bullets">
              @for (line of brief.bullets; track line) {
                <li>{{ line }}</li>
              }
            </ul>
          }
        </article>

        @if (trackHistory && history().length > 1) {
          <section class="pa-brief-history" aria-label="Brief history">
            <span class="pa-brief-history-title">Earlier reads today</span>
            <div class="pa-brief-history-list">
              @for (entry of history().slice(1); track entry.at + entry.fingerprint) {
                <details class="pa-brief-history-item">
                  <summary>
                    <time [attr.datetime]="entry.at">{{ formatAt(entry.at) }}</time>
                    <span>{{ entry.headline }}</span>
                  </summary>
                  <p>{{ entry.summary }}</p>
                  @if (entry.bullets.length) {
                    <ul>
                      @for (line of entry.bullets; track line) {
                        <li>{{ line }}</li>
                      }
                    </ul>
                  }
                </details>
              }
            </div>
          </section>
        }
      } @else {
        <p class="pa-insight-empty">Waiting for the first price-action brief…</p>
      }
    </section>
  `,
})
export class PaSignalBriefComponent implements OnChanges {
  protected readonly formatAt = formatSignalCalculatedAt;

  @Input() trackHistory = true;
  @Input() sessionKey = '';
  @Input() signalAt = '';
  @Input() action = 'NO-TRADE';
  @Input() structuralAction?: string;
  @Input() conviction = 0;
  @Input() entryThreshold = 60;
  @Input() bias?: string;
  @Input() chartVetoed = false;
  @Input() vetoReason?: string;
  @Input() tfAligned?: number;
  @Input() tfAlignedTotal?: number;
  @Input() lastPrice?: number;
  @Input() paDrilldown?: PaDrilldown | null;
  @Input() tradeSetup?: DeckTradeSetup | null;
  @Input() marketRegime?: DeckMarketRegime | null;
  @Input() patternInsights?: DeckLiveTick['patternInsights'];
  @Input() reading?: DeckGaugeReading;
  @Input() primaryTimeframe?: string;

  readonly history = signal<PaBriefSnapshot[]>([]);

  current(): PaBriefSnapshot | null {
    return this.history()[0] ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sessionKey'] && !changes['sessionKey'].firstChange) {
      this.history.set([]);
    }
    this.refreshBrief();
  }

  actionTone(action: string): string {
    if (action.includes('CE')) return 'tone-positive';
    if (action.includes('PE')) return 'tone-negative';
    if (action === 'NO-TRADE') return 'tone-neutral';
    return 'tone-warn';
  }

  private refreshBrief(): void {
    const next = buildPaBrief({
      action: this.action,
      structuralAction: this.structuralAction,
      conviction: this.conviction,
      entryThreshold: this.entryThreshold,
      bias: this.bias,
      chartVetoed: this.chartVetoed,
      vetoReason: this.vetoReason,
      tfAligned: this.tfAligned,
      tfAlignedTotal: this.tfAlignedTotal,
      lastPrice: this.lastPrice,
      paDrilldown: this.paDrilldown,
      tradeSetup: this.tradeSetup,
      marketRegime: this.marketRegime,
      patternInsights: this.patternInsights,
      reading: this.reading,
      primaryTimeframe: this.primaryTimeframe,
      signalAt: this.signalAt,
    });

    this.history.update((rows) => {
      const prev = rows[0];
      if (!prev) return [next];
      if (prev.fingerprint === next.fingerprint) {
        return [{ ...prev, updatedAt: next.updatedAt }, ...rows.slice(1)];
      }
      if (!this.trackHistory) return [next];
      return [next, ...rows].slice(0, 24);
    });
  }
}