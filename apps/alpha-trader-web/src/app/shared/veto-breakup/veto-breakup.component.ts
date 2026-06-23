import { Component, Input } from '@angular/core';
import { VetoBreakupItem } from '../../core/models/deck.models';

const STATE_ORDER: Record<VetoBreakupItem['state'], number> = {
  block: 0,
  warn: 1,
  skipped: 2,
  ok: 3,
};

@Component({
  selector: 'app-veto-breakup',
  standalone: true,
  template: `
    @if (!sortedItems.length) {
      <div class="muted" style="font-size: 0.72rem">No veto data</div>
    } @else {
      @for (item of sortedItems; track item.id) {
        <div class="veto-row" [class]="item.state">
          <div class="veto-row-head">
            <span>{{ item.label }}</span>
            <span class="veto-badge" [class]="item.state">{{ badgeLabel(item.state) }}</span>
          </div>
          <div class="veto-row-detail">{{ item.detail }}</div>
          @if (item.meter !== null && item.meter !== undefined && item.meter > 0) {
            <div class="veto-meter">
              <div [style.width.%]="meterWidth(item.meter)"></div>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .veto-row {
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface) 90%, var(--bg));
      }

      .veto-row + .veto-row {
        margin-top: 8px;
      }

      .veto-row.block {
        border-color: color-mix(in srgb, var(--pe) 35%, var(--border));
        background: color-mix(in srgb, var(--pe) 10%, var(--surface));
      }

      .veto-row.warn {
        border-color: color-mix(in srgb, var(--conflict) 35%, var(--border));
        background: color-mix(in srgb, var(--conflict) 10%, var(--surface));
      }

      .veto-row.skipped {
        border-color: color-mix(in srgb, var(--option) 28%, var(--border));
      }

      .veto-row.ok {
        border-color: color-mix(in srgb, var(--ce) 28%, var(--border));
      }

      .veto-row-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        align-items: center;
        font-size: 0.68rem;
        font-weight: 700;
        color: var(--text);
      }

      .veto-row-detail {
        margin-top: 4px;
        font-size: 0.64rem;
        line-height: 1.45;
        color: var(--muted);
      }

      .veto-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        font-size: 0.54rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .veto-badge.block {
        color: var(--pe);
        border-color: color-mix(in srgb, var(--pe) 35%, var(--border));
        background: color-mix(in srgb, var(--pe) 10%, transparent);
      }

      .veto-badge.warn {
        color: var(--conflict);
        border-color: color-mix(in srgb, var(--conflict) 35%, var(--border));
        background: color-mix(in srgb, var(--conflict) 10%, transparent);
      }

      .veto-badge.skipped {
        color: var(--option);
        border-color: color-mix(in srgb, var(--option) 30%, var(--border));
        background: color-mix(in srgb, var(--option) 10%, transparent);
      }

      .veto-badge.ok {
        color: var(--ce);
        border-color: color-mix(in srgb, var(--ce) 30%, var(--border));
        background: color-mix(in srgb, var(--ce) 10%, transparent);
      }

      .veto-meter {
        height: 6px;
        margin-top: 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--border) 80%, transparent);
        overflow: hidden;
      }

      .veto-meter > div {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--option) 65%, transparent),
          color-mix(in srgb, var(--ce) 75%, transparent)
        );
      }
    `,
  ],
})
export class VetoBreakupComponent {
  @Input() items: VetoBreakupItem[] | null | undefined;

  get sortedItems(): VetoBreakupItem[] {
    const list = [...(this.items ?? [])];
    return list.sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9));
  }

  badgeLabel(state: VetoBreakupItem['state']): string {
    if (state === 'block') return 'BLOCK';
    if (state === 'warn') return 'WARN';
    if (state === 'skipped') return 'EASED';
    return 'OK';
  }

  meterWidth(meter: number): number {
    return Math.max(0, Math.min(100, meter));
  }

  summary(): string {
    const items = this.sortedItems;
    const blocks = items.filter((i) => i.state === 'block').length;
    const warns = items.filter((i) => i.state === 'warn').length;
    if (blocks) return `${blocks} block${blocks > 1 ? 's' : ''}`;
    if (warns) return `${warns} warn${warns > 1 ? 's' : ''}`;
    return 'All clear';
  }
}