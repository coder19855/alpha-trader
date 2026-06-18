import { Component, Input } from '@angular/core';
import { ConvictionBonus } from '../../core/models/deck.models';

@Component({
  selector: 'app-conviction-bonuses',
  standalone: true,
  template: `
    @if (bonuses.length) {
      <div class="conviction-bonuses" aria-label="Entry conviction bonuses">
        <div class="bonus-head">
          <span>Entry bonuses</span>
          <span>{{ baseConviction }}% base → {{ entryConviction }}% entry</span>
        </div>
        <div class="bonus-list">
          @for (bonus of bonuses; track bonus.label) {
            <span
              class="bonus-chip"
              [class.positive]="bonus.points > 0"
              [class.negative]="bonus.points < 0"
            >
              {{ bonus.label }} {{ bonus.points > 0 ? '+' : '' }}{{ bonus.points }}
            </span>
          }
        </div>
      </div>
    }
  `,
})
export class ConvictionBonusesComponent {
  @Input() bonuses: ConvictionBonus[] = [];
  @Input() baseConviction = 0;
  @Input() entryConviction = 0;
}