import { Component, Input } from '@angular/core';

export interface DeckEventRow {
  t: number;
  type: string;
  label: string;
  detail?: string;
}

@Component({
  selector: 'app-event-list',
  standalone: true,
  styles: [
    `
      .event-top {
        justify-content: space-between;
        gap: 10px;
      }
      .event-label {
        flex: 1;
        min-width: 0;
      }
      .event-badge {
        flex-shrink: 0;
        margin-left: auto;
      }
    `,
  ],
  template: `
    <section class="events-panel">
      <p class="events-hint">Latest session events</p>
      <div class="event-list">
        @for (e of events; track e.t) {
          <div class="event-row">
            <div class="event-time">{{ formatTime(e.t) }}</div>
            <div class="event-body">
              <div class="event-top">
                <span class="event-label">{{ e.label }}</span>
                <span class="event-badge" [class]="eventTypeClass(e.type)">
                  {{ eventTypeLabel(e.type) }}
                </span>
              </div>
              @if (e.detail) {
                <div class="event-detail">{{ e.detail }}</div>
              }
            </div>
          </div>
        } @empty {
          <div class="muted" style="font-size: 0.72rem">No flips or vetoes in this window yet.</div>
        }
      </div>
    </section>
  `,
})
export class EventListComponent {
  @Input() events: DeckEventRow[] = [];

  formatTime(t: number): string {
    return new Date(t).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  eventTypeClass(type: string): string {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('veto') && normalized.includes('clear')) return 'veto_clear';
    if (normalized.includes('veto')) return 'veto';
    if (normalized.includes('flip')) return 'flip';
    if (normalized.includes('trade')) return 'trade';
    return normalized.replace(/[^a-z0-9_]/g, '_');
  }

  eventTypeLabel(type: string): string {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('veto') && normalized.includes('clear')) return 'Veto clear';
    if (normalized.includes('veto')) return 'Veto';
    if (normalized.includes('flip')) return 'Flip';
    if (normalized.includes('trade')) return 'Trade';
    return type || 'Event';
  }
}