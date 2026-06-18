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