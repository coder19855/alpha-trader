import { Component, Input } from '@angular/core';
import { VetoTimelinePoint } from '../../core/models/deck.models';

@Component({
  selector: 'app-veto-strip',
  standalone: true,
  template: `
    @if (segments.length) {
      <div class="veto-timeline-wrap">
        <div class="session-rail-label">Veto timeline</div>
        <div class="veto-strip" title="Amber = chart veto blocked entry">
          @for (seg of segments; track $index) {
            <div class="veto-seg" [class]="seg.className"></div>
          }
        </div>
      </div>
    }
  `,
})
export class VetoStripComponent {
  @Input() timeline: VetoTimelinePoint[] = [];

  get segments(): Array<{ className: string }> {
    const timeline = this.timeline;
    if (!timeline.length) return [];

    const maxSegs = Math.min(timeline.length, 120);
    const step = Math.max(1, Math.floor(timeline.length / maxSegs));
    const segments: Array<{ className: string }> = [];

    for (let i = 0; i < timeline.length; i += step) {
      const seg = timeline[i];
      if (seg.vetoed) {
        segments.push({ className: 'vetoed' });
      } else if (seg.action === 'CE-BUY') {
        segments.push({ className: 'clear' });
      } else if (seg.action === 'PE-BUY') {
        segments.push({ className: 'bear' });
      } else {
        segments.push({ className: 'neutral' });
      }
    }

    return segments;
  }
}