import { Component, Input } from '@angular/core';
import { DeckComponentGauge } from '../../core/models/deck.models';

@Component({
  selector: 'app-bipolar-list',
  standalone: true,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bipolar-row-rich {
        grid-template-columns: 1fr;
        gap: 4px;
        align-items: stretch;
      }
      .bipolar-row-rich .bipolar-row-main {
        display: grid;
        grid-template-columns: 78px 1fr 44px;
        gap: 8px;
        align-items: center;
      }
      .bipolar-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-left: 0;
      }
      .bipolar-weight {
        padding: 1px 6px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.03);
        font-size: 0.58rem;
        font-weight: 600;
        color: var(--muted);
      }
    `,
  ],
  template: `
    @if (!components.length) {
      <div class="muted" style="font-size: 0.72rem">No data</div>
    } @else {
      @for (comp of components; track comp.id) {
        @if (showRichMeta(comp)) {
          <div class="bipolar-row bipolar-row-rich">
            <div class="bipolar-row-main">
              <span
                class="bipolar-label"
                [title]="comp.interpretation || comp.label"
              >
                {{ comp.label }}
              </span>
              <div class="bipolar-track">
                <div class="bipolar-mid"></div>
                <div
                  class="bipolar-fill"
                  [class.positive]="comp.value >= 0"
                  [class.negative]="comp.value < 0"
                  [style.width.%]="fillWidth(comp.value)"
                ></div>
              </div>
              <span class="bipolar-value">{{ comp.readout || formatValue(comp.value) }}</span>
            </div>
            <div class="bipolar-meta">
              <span class="bipolar-weight">Weight {{ weightPct(comp.weight!) }}%</span>
            </div>
          </div>
        } @else {
          <div class="bipolar-row">
            <span
              class="bipolar-label"
              [title]="comp.interpretation || comp.label"
            >
              {{ comp.label }}
            </span>
            <div class="bipolar-track">
              <div class="bipolar-mid"></div>
              <div
                class="bipolar-fill"
                [class.positive]="variant !== 'option' && comp.value >= 0"
                [class.negative]="variant !== 'option' && comp.value < 0"
                [class.option-positive]="variant === 'option' && comp.value >= 0"
                [class.option-negative]="variant === 'option' && comp.value < 0"
                [style.width.%]="fillWidth(comp.value)"
              ></div>
            </div>
            <span class="bipolar-value">{{ comp.readout || formatValue(comp.value) }}</span>
          </div>
        }
      }
    }
  `,
})
export class BipolarListComponent {
  protected readonly Number = Number;

  @Input() components: DeckComponentGauge[] = [];
  @Input() variant: 'option' | 'priceAction' = 'priceAction';

  showRichMeta(comp: DeckComponentGauge): boolean {
    if (this.variant !== 'priceAction') return false;
    return comp.weight != null && Number.isFinite(comp.weight);
  }

  weightPct(weight: number): number {
    return Math.round(weight <= 1 ? weight * 100 : weight);
  }

  fillWidth(value: number): number {
    const v = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    return Math.abs(v) * 50;
  }

  formatValue(value: number): string {
    const v = Number.isFinite(value) ? value : 0;
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}`;
  }
}