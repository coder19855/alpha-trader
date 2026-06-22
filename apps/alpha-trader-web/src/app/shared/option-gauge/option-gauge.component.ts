import { Component, Input } from '@angular/core';
import { DeckGaugeReading } from '../../core/models/deck.models';

@Component({
  selector: 'app-option-gauge',
  standalone: true,
  template: `
    <section class="gauge-block flow-option-block">
      <div class="gauge-head">
        <span>Option flow</span>
        <span class="gauge-readout">{{ formatReadout(reading) }}</span>
      </div>
      <div class="gauge-track option">
        <div class="gauge-zone pe">Put</div>
        <div class="gauge-zone ce">Call</div>
        <div class="gauge-needle" [style.left.%]="needleLeft(reading)"></div>
      </div>
      <div class="gauge-scale"><span>-1</span><span>0</span><span>+1</span></div>
      <p class="gauge-lane-hint">
        Independent option-chain score. Does not alter the price-action entry %.
      </p>
    </section>

    <section class="lane-block">
      <div class="lane-row lane-scale-row">
        <span aria-hidden="true"></span>
        <div class="lane-scale"><span>0%</span><span>50%</span><span>100%</span></div>
        <span aria-hidden="true"></span>
      </div>
      <div class="lane-row flow-option-lane">
        <span>Flow</span>
        <div class="lane-bar">
          <div class="lane-fill option" [style.width.%]="conviction"></div>
        </div>
        <span>{{ conviction }}%</span>
      </div>
    </section>
  `,
  styles: [
    `
      .gauge-lane-hint {
        margin: 6px 0 0;
        font-size: 0.62rem;
        color: var(--muted);
        line-height: 1.35;
      }
    `,
  ],
})
export class OptionGaugeComponent {
  @Input() reading: DeckGaugeReading = {
    value: 0,
    percent: 0,
    label: 'FLAT',
  };
  @Input() conviction = 0;

  needleLeft(reading: Pick<DeckGaugeReading, 'value'>): number {
    const value = Number.isFinite(reading.value) ? reading.value : 0;
    return Math.min(100, Math.max(0, ((value + 1) / 2) * 100));
  }

  formatReadout(reading: DeckGaugeReading): string {
    const value = Number.isFinite(reading.value) ? reading.value : 0;
    const side =
      reading.label || (value >= 0.35 ? 'CE' : value <= -0.35 ? 'PE' : 'FLAT');
    if (side === 'FLAT') return '0.00 FLAT';
    return `${Math.abs(value).toFixed(2)} ${side}`;
  }
}