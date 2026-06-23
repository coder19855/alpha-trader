import { Component, Input } from '@angular/core';
import { ConvictionBonus } from '../../core/models/deck.models';

@Component({
  selector: 'app-conviction-bonuses',
  standalone: true,
  template: `
    @if (bonuses.length) {
      <div class="conviction-bonuses" [attr.aria-label]="sectionTitle">
        <div class="bonus-head">
          <span>{{ sectionTitle }}</span>
          <span>{{ baseConviction }}% base → {{ entryConviction }}% PA</span>
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
  @Input() sectionTitle = 'Entry bonuses';
  @Input() bonuses: ConvictionBonus[] = [];
  @Input() baseConviction = 0;
  @Input() entryConviction = 0;
}