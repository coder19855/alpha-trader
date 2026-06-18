import { Component, Input } from '@angular/core';
import { ConvictionBonus, DeckGaugeReading } from '../../core/models/deck.models';
import { ConvictionBonusesComponent } from '../conviction-bonuses/conviction-bonuses.component';

@Component({
  selector: 'app-pa-gauge',
  standalone: true,
  imports: [ConvictionBonusesComponent],
  template: `
    <section class="gauge-block flow-pa-block">
      <div class="gauge-head">
        <span>Price action</span>
        <span class="gauge-readout">{{ formatReadout(reading) }}</span>
      </div>
      <div class="gauge-track pa">
        <div class="gauge-zone pe">PE</div>
        <div class="gauge-zone ce">CE</div>
        <div class="gauge-needle" [style.left.%]="needleLeft(reading)"></div>
        @if (reading.ghost !== null && reading.ghost !== undefined && Number.isFinite(reading.ghost)) {
          <div class="gauge-ghost" [style.left.%]="needleLeft({ value: reading.ghost! })"></div>
        }
      </div>
      <div class="gauge-scale"><span>-1</span><span>0</span><span>+1</span></div>
      <p class="gauge-lane-hint">
        Bipolar needle = <strong>direction</strong> from primary TF score. PA % bar =
        <strong>conviction strength</strong> (0–100%) — they measure different things.
      </p>
    </section>

    <section class="lane-block">
      <div class="lane-row lane-scale-row">
        <span aria-hidden="true"></span>
        <div class="lane-scale"><span>0%</span><span>50%</span><span>100%</span></div>
        <span aria-hidden="true"></span>
      </div>
      <div class="lane-row flow-pa-lane">
        <span>PA</span>
        <div class="lane-bar">
          <div class="lane-fill pa" [style.width.%]="paPercent"></div>
        </div>
        <span>{{ paPercent }}%</span>
      </div>
      @if (!hideCombinedLane) {
        <div class="lane-row flow-combined-lane">
          <span>{{ combinedLabel }}</span>
          <div class="lane-bar">
            <div class="lane-fill combined" [style.width.%]="combinedPercent"></div>
          </div>
          <span>{{ combinedPercent }}%</span>
        </div>
      }
      <app-conviction-bonuses
        [bonuses]="convictionBonuses"
        [baseConviction]="weightedBaseConviction"
        [entryConviction]="entryConviction"
      />
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
export class PaGaugeComponent {
  protected readonly Number = Number;

  @Input() reading: DeckGaugeReading = {
    value: 0,
    percent: 0,
    label: 'FLAT',
  };

  @Input() paPercent = 0;
  @Input() combinedPercent = 0;
  @Input() combinedLabel = 'Weighted';
  /** In PA-only mode the combined lane duplicates PA % — hide it. */
  @Input() hideCombinedLane = false;
  @Input() weightedBaseConviction = 0;
  @Input() entryConviction = 0;
  @Input() convictionBonuses: ConvictionBonus[] = [];

  needleLeft(reading: Pick<DeckGaugeReading, 'value'>): number {
    const value = Number.isFinite(reading.value) ? reading.value : 0;
    return Math.min(100, Math.max(0, ((value + 1) / 2) * 100));
  }

  formatReadout(reading: DeckGaugeReading): string {
    const value = Number.isFinite(reading.value) ? reading.value : 0;
    const side = reading.label || (value >= 0.35 ? 'CE' : value <= -0.35 ? 'PE' : 'FLAT');
    if (side === 'FLAT') return '0.00 FLAT';
    return `${Math.abs(value).toFixed(2)} ${side}`;
  }
}