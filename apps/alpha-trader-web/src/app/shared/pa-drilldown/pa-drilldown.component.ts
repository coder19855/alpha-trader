import { Component, Input, signal } from '@angular/core';
import { PaDrilldown } from '../../core/models/deck.models';

@Component({
  selector: 'app-pa-drilldown',
  standalone: true,
  template: `
    @if (!drilldown?.sections?.length) {
      <div class="muted" style="font-size: 0.68rem">No breakdown available</div>
    } @else {
      @for (section of drilldown!.sections; track section.id) {
        <div class="drilldown-section" [class.open]="isOpen(section.id)">
          <button
            type="button"
            class="drilldown-section-head"
            [attr.aria-expanded]="isOpen(section.id)"
            (click)="toggle(section.id)"
          >
            <span>{{ section.title }}</span>
            <span class="chevron">›</span>
          </button>
          <div class="drilldown-section-body">
            @for (row of section.rows; track row.label) {
              <div class="drilldown-row">
                <span class="drilldown-label">{{ row.label }}</span>
                <span class="drilldown-value" [class]="row.tone ? 'tone-' + row.tone : ''">
                  {{ row.value }}
                </span>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
})
export class PaDrilldownComponent {
  @Input() drilldown: PaDrilldown | null | undefined;

  private readonly openSections = signal<Record<string, boolean>>({});

  isOpen(id: string): boolean {
    const stored = this.openSections()[id];
    if (stored != null) return stored;
    return id.startsWith('tf-');
  }

  toggle(id: string): void {
    this.openSections.update((prev) => ({
      ...prev,
      [id]: !this.isOpen(id),
    }));
  }
}