import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import { OptionChainSignalPayload } from '../../core/models/option-chain.models';
import { formatSignalCalculatedAt } from '../../core/utils/format-signal-timestamp';
import {
  buildOcBrief,
  OcBriefSnapshot,
} from './option-signal-brief.utils';

@Component({
  selector: 'app-option-signal-brief',
  standalone: true,
  template: `
    <section class="pa-signal-brief oc-signal-brief" aria-label="Option chain brief">
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
          <section class="pa-brief-history" aria-label="Option brief history">
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
        <p class="pa-insight-empty">Waiting for option chain data to generate a brief…</p>
      }
    </section>
  `,
})
export class OptionSignalBriefComponent implements OnChanges {
  protected readonly formatAt = formatSignalCalculatedAt;

  @Input() trackHistory = true;
  @Input() sessionKey = '';
  @Input() data: OptionChainSignalPayload | null = null;

  readonly history = signal<OcBriefSnapshot[]>([]);

  current(): OcBriefSnapshot | null {
    return this.history()[0] ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sessionKey'] && !changes['sessionKey'].firstChange) {
      this.history.set([]);
    }
    this.refreshBrief();
  }

  actionTone(action: string): string {
    if (action.includes('BULLISH')) return 'tone-positive';
    if (action.includes('BEARISH')) return 'tone-negative';
    return 'tone-neutral';
  }

  private refreshBrief(): void {
    if (!this.data) return;
    const next = buildOcBrief(this.data);

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