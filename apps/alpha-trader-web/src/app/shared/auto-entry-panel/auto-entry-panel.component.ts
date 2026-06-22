import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoEntrySnapshot } from '../../core/models/deck.models';
import { DeckApiService } from '../../core/services/deck-api.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-auto-entry-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="auto-exit-panel auto-entry-panel">
      <div class="panel-head">
        <span>Auto-entry</span>
        <span class="auto-exit-status-pill" [class]="snapshot()?.enabled ? 'watching' : 'off'">
          {{ snapshot()?.enabled ? 'Armed' : 'Off' }}
        </span>
      </div>
      <p class="auto-exit-warning">
        <strong>Warning:</strong> when enabled, the server can place
        <strong>MARKET buy</strong> orders on index options when the selected entry
        signal profile confirms. Verify capital and lot size before arming.
      </p>
      @if (snapshot(); as s) {
        <div class="auto-exit-controls">
          <label class="auto-exit-toggle">
            <input
              type="checkbox"
              [ngModel]="s.enabled"
              (ngModelChange)="patch({ enabled: $event })"
            />
            <span>Enable auto-entry</span>
          </label>
          <label class="auto-exit-retest">
            <span>Entry signal</span>
            <select
              [ngModel]="s.signalProfile"
              (ngModelChange)="patch({ signalProfile: $event })"
            >
              @for (group of s.signalPresetGroups; track group.id) {
                <optgroup [label]="group.label">
                  @for (p of group.presets; track p.id) {
                    <option [value]="p.id">{{ p.label }}</option>
                  }
                </optgroup>
              }
            </select>
          </label>
        </div>
        @if (profileHint()) {
          <p class="auto-exit-policy-hint">{{ profileHint() }}</p>
        }
      }
      <p class="auto-exit-live-status muted">
        Includes default engine (normal PA) and fast PA signal presets — same list as Benchmark.
      </p>
    </section>
  `,
})
export class AutoEntryPanelComponent implements OnInit {
  private readonly api = inject(DeckApiService);
  private readonly notify = inject(NotificationService);

  readonly saved = output<AutoEntrySnapshot>();
  readonly snapshot = signal<AutoEntrySnapshot | null>(null);

  ngOnInit(): void {
    this.api.getAutoEntry().subscribe({
      next: (s) => this.snapshot.set(s),
      error: (err) => this.notify.error(err?.message || 'Failed to load auto-entry'),
    });
  }

  profileHint(): string {
    const s = this.snapshot();
    if (!s) return '';
    const preset = s.signalPresetGroups
      .flatMap((g) => g.presets)
      .find((p) => p.id === s.signalProfile);
    if (!preset?.gates?.length) return '';
    return preset.gates.join(' · ');
  }

  patch(patch: Partial<AutoEntrySnapshot>): void {
    this.api.patchAutoEntry(patch).subscribe({
      next: (s) => {
        this.snapshot.set(s);
        this.saved.emit(s);
        this.notify.success('Auto-entry updated');
      },
      error: (err) => this.notify.error(err?.error?.error || err.message || 'Update failed'),
    });
  }
}