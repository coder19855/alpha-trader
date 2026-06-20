import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoExitSnapshot } from '../../core/models/deck.models';
import { DeckApiService } from '../../core/services/deck-api.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-auto-exit-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="auto-exit-panel">
      <div class="panel-head">
        <span>Auto-exit guard</span>
        <span class="auto-exit-status-pill" [class]="statusClass()">
          {{ statusLabel() }}
        </span>
      </div>
      <p class="auto-exit-warning">
        <strong>Warning:</strong> when enabled, the server can place
        <strong>MARKET sell</strong> orders to square off watched index option legs using
        benchmark exit policies.
      </p>
      @if (snapshot(); as s) {
        <div class="auto-exit-controls">
          <label class="auto-exit-toggle">
            <input
              type="checkbox"
              [ngModel]="s.enabled"
              (ngModelChange)="patch({ enabled: $event })"
            />
            <span>Enable auto-exit</span>
          </label>
          <label class="auto-exit-retest">
            <span>Exit policy</span>
            <select
              [ngModel]="s.exitPolicy"
              (ngModelChange)="patch({ exitPolicy: $event })"
            >
              @for (p of s.exitPolicies; track p.id) {
                <option [value]="p.id">{{ p.label }}</option>
              }
            </select>
          </label>
          <label class="auto-exit-retest">
            <span>Position policy</span>
            <select
              [ngModel]="s.positionPolicy"
              (ngModelChange)="patch({ positionPolicy: $event })"
            >
              @for (p of s.positionPolicies; track p.id) {
                <option [value]="p.id">{{ p.label }}</option>
              }
            </select>
          </label>
        </div>
        @if (exitPolicyHint()) {
          <p class="auto-exit-policy-hint">{{ exitPolicyHint() }}</p>
        }
        @if (positionPolicyHint()) {
          <p class="auto-exit-policy-hint">{{ positionPolicyHint() }}</p>
        }
      }
      <p class="auto-exit-live-status muted">
        {{ liveStatus() }}
      </p>
    </section>
  `,
})
export class AutoExitPanelComponent implements OnInit {
  private readonly api = inject(DeckApiService);
  private readonly notify = inject(NotificationService);

  readonly guardStatus = input<string | null | undefined>(null);
  readonly guardMessage = input<string | null | undefined>(null);
  readonly saved = output<AutoExitSnapshot>();

  readonly snapshot = signal<AutoExitSnapshot | null>(null);

  ngOnInit(): void {
    this.api.getAutoExit().subscribe({
      next: (s) => this.snapshot.set(s),
      error: (err) => this.notify.error(err?.message || 'Failed to load auto-exit'),
    });
  }

  statusClass(): string {
    const guard = this.guardStatus();
    if (guard === 'watching' || guard === 'pending') return guard;
    if (guard === 'executed') return 'executed';
    if (this.snapshot()?.enabled) return 'watching';
    return 'off';
  }

  statusLabel(): string {
    const guard = this.guardStatus();
    if (guard === 'pending') return 'Pending';
    if (guard === 'executed') return 'Executed';
    if (guard === 'watching') return 'Armed';
    return this.snapshot()?.enabled ? 'Armed' : 'Off';
  }

  liveStatus(): string {
    return (
      this.guardMessage() ||
      'Server-side guard runs independently of this browser tab when armed and Fyers is connected.'
    );
  }

  exitPolicyHint(): string {
    const s = this.snapshot();
    if (!s) return '';
    return s.exitPolicies.find((p) => p.id === s.exitPolicy)?.hint ?? '';
  }

  positionPolicyHint(): string {
    const s = this.snapshot();
    if (!s) return '';
    return s.positionPolicies.find((p) => p.id === s.positionPolicy)?.hint ?? '';
  }

  patch(patch: Partial<AutoExitSnapshot>): void {
    this.api.patchAutoExit(patch).subscribe({
      next: (s) => {
        this.snapshot.set(s);
        this.saved.emit(s);
        this.notify.success('Auto-exit updated');
      },
      error: (err) => this.notify.error(err?.error?.error || err.message || 'Update failed'),
    });
  }
}