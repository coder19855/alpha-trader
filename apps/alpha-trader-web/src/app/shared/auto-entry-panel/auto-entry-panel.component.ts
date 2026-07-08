import { CommonModule } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AutoEntrySnapshot, AutoEntryTraceEvent } from '../../core/models/deck.models';
import { DeckApiService } from '../../core/services/deck-api.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-auto-entry-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="auto-exit-panel auto-entry-panel">
      <div class="panel-head">
        <span>Auto-entry</span>
        <span class="auto-exit-status-pill" [class]="statusClass()">
          {{ statusLabel() }}
        </span>
      </div>
      <p class="auto-exit-warning">
        <strong>Warning:</strong> when live-armed, the server places
        <strong>MARKET buy</strong> orders on index options after signal confirm.
        Use <strong>dry-run</strong> first to paper-trade without broker orders.
      </p>
      @if (confirmationCount() != null) {
        <div class="confirmation-card">
          <div class="confirmation-row">
            <span class="confirmation-label">Confirmations</span>
            <span class="confirmation-value">
              {{ confirmationCount() }} / {{ confirmationsRequired() ?? 2 }}
            </span>
          </div>
          <p class="confirmation-note">
            Two consecutive confirmations are required before the server places the order.
          </p>
          @if (pendingAction()) {
            <p class="confirmation-note pending-action">
              Pending signal: <strong>{{ pendingAction() }}</strong>
            </p>
          }
        </div>
      }
      @if (lastEvaluatedAt()) {
        <p class="auto-exit-live-status trace-updated">
          Last evaluated: {{ lastEvaluatedAt() | date: 'shortTime' }}
        </p>
      }
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

          <label class="auto-exit-toggle">
            <input
              type="checkbox"
              [disabled]="!s.enabled"
              [ngModel]="s.dryRun"
              (ngModelChange)="onDryRunChange($event)"
            />
            <span>Dry-run (paper only — no broker orders)</span>
          </label>

          <label class="auto-exit-toggle live-arm-toggle">
            <input
              type="checkbox"
              [disabled]="!s.enabled || s.dryRun"
              [ngModel]="s.armedLive"
              (ngModelChange)="onArmedLiveChange($event)"
            />
            <span>Arm live MARKET orders (resets each session day)</span>
          </label>

          <label class="auto-exit-retest">
            <span>Lots per entry</span>
            <input
              type="number"
              class="entry-num"
              [min]="s.limits?.minLots ?? 1"
              [max]="s.limits?.maxLots ?? 20"
              [ngModel]="s.lots"
              (ngModelChange)="patch({ lots: $event })"
            />
          </label>

          <label class="auto-exit-retest">
            <span>Entry signal mode</span>
            <select
              [ngModel]="s.signalMode"
              (ngModelChange)="onSignalModeChange($event)"
            >
              <option value="engine">Default engine (PA conviction ≥ threshold)</option>
              <option value="single">Single fast-entry preset</option>
            </select>
          </label>

          @if (s.signalMode === 'engine') {
            <label class="auto-exit-retest">
              <span>Conviction threshold %</span>
              <input
                type="number"
                class="entry-num"
                [min]="s.limits?.minEntryThreshold ?? 40"
                [max]="s.limits?.maxEntryThreshold ?? 85"
                [ngModel]="s.entryThreshold"
                (ngModelChange)="patch({ entryThreshold: $event })"
              />
            </label>

            <label class="auto-exit-toggle">
              <input
                type="checkbox"
                [disabled]="!s.enabled"
                [ngModel]="s.ignoreChartVeto"
                (ngModelChange)="patch({ ignoreChartVeto: $event })"
              />
              <span>Ignore chart veto (enter even when PA veto is active)</span>
            </label>
          }

          @if (s.signalMode === 'single') {
            <label class="auto-exit-retest">
              <span>Fast-entry preset</span>
              <select
                [ngModel]="s.signalProfile"
                (ngModelChange)="patch({ signalProfile: $event })"
              >
                @for (group of s.signalPresetGroups; track group.id) {
                  <optgroup [label]="group.label">
                    @for (p of fastPresets(group); track p.id) {
                      <option [value]="p.id">{{ p.label }}</option>
                    }
                  </optgroup>
                }
              </select>
            </label>
          }

          <label class="auto-exit-retest">
            <span>Max entries / day</span>
            <input
              type="number"
              class="entry-num"
              [min]="s.limits?.minEntriesPerDay ?? 1"
              [max]="s.limits?.maxEntriesPerDay ?? 10"
              [ngModel]="s.maxEntriesPerDay"
              (ngModelChange)="patch({ maxEntriesPerDay: $event })"
            />
          </label>

          <label class="auto-exit-toggle">
            <input
              type="checkbox"
              [ngModel]="s.greenDayStop"
              (ngModelChange)="patch({ greenDayStop: $event })"
            />
            <span>
              Green-day stop — no further entries after any trade closes ≥
              {{ s.limits?.greenDayMinR ?? 1 }}R
            </span>
          </label>
        </div>

        @if (profileHint()) {
          <p class="auto-exit-policy-hint">{{ profileHint() }}</p>
        }
        @for (hint of s.hints ?? []; track hint) {
          <p class="auto-exit-policy-hint">{{ hint }}</p>
        }

        @if (s.session; as sess) {
          <p class="auto-exit-live-status" [class.muted]="sess.canEnter">
            @if (s.dryRun) {
              Paper today: {{ sess.dryRunsToday ?? 0 }} simulated
            } @else {
              Live today: {{ sess.entriesToday }} / {{ sess.maxEntriesPerDay }} entries
            }
            @if (sess.greenDayLocked) {
              · <strong>Green-day locked</strong>
            }
            @if (!sess.canEnter && sess.blockReason) {
              · {{ sess.blockReason }}
            }
          </p>
        }
      }
      @if (recentEvents(); as events) {
        <div class="trace-card">
          <div class="trace-head">
            <span>Auto-entry trace</span>
            <span class="trace-hint">Last {{ events.length }} steps</span>
          </div>
          @for (event of events; track event.at + event.title) {
            <div
              class="trace-row"
              [class.success]="event.tone === 'success'"
              [class.warn]="event.tone === 'warn'"
              [class.error]="event.tone === 'error'"
            >
              <div class="trace-mark"></div>
              <div class="trace-body">
                <div class="trace-title-row">
                  <span class="trace-title">{{ event.title }}</span>
                  <span class="trace-time">{{ event.at | date: 'shortTime' }}</span>
                </div>
                @if (event.detail) {
                  <p class="trace-detail">{{ event.detail }}</p>
                }
              </div>
            </div>
          }
        </div>
      }
      @if (pendingReason()) {
        <p class="auto-exit-live-status muted">
          Signal reason: {{ pendingReason() }}
        </p>
      }
      <p class="auto-exit-live-status muted">
        {{ liveStatus() }}
      </p>
    </section>
  `,
  styles: [
    `
      .entry-num {
        width: 100%;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: #11151c;
        color: #e8ecf1;
        font-size: 0.82rem;
      }
      .live-arm-toggle input:disabled + span {
        opacity: 0.55;
      }
      .confirmation-card {
        margin: 10px 0 12px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(34, 211, 238, 0.22);
        background: rgba(34, 211, 238, 0.06);
      }
      .confirmation-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .confirmation-label {
        color: var(--muted);
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 700;
      }
      .confirmation-value {
        color: #a5f3fc;
        font-size: 0.95rem;
        font-weight: 800;
      }
      .confirmation-note {
        margin: 6px 0 0;
        font-size: 0.7rem;
        line-height: 1.4;
        color: var(--muted);
      }
      .pending-action strong {
        color: #e8ecf1;
      }
      .trace-updated {
        margin-top: 0;
      }
      .trace-card {
        margin: 12px 0 6px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(15, 23, 42, 0.72);
      }
      .trace-head,
      .trace-title-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }
      .trace-head {
        margin-bottom: 8px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #cbd5e1;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .trace-hint,
      .trace-time {
        color: var(--muted);
        font-size: 0.68rem;
        font-weight: 600;
      }
      .trace-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 8px 0;
        border-top: 1px solid rgba(148, 163, 184, 0.08);
      }
      .trace-row:first-of-type {
        border-top: 0;
        padding-top: 0;
      }
      .trace-mark {
        width: 10px;
        height: 10px;
        margin-top: 4px;
        border-radius: 999px;
        background: #64748b;
        flex: 0 0 auto;
      }
      .trace-row.success .trace-mark {
        background: #22c55e;
      }
      .trace-row.warn .trace-mark {
        background: #f59e0b;
      }
      .trace-row.error .trace-mark {
        background: #ef4444;
      }
      .trace-body {
        min-width: 0;
        flex: 1;
      }
      .trace-title {
        font-size: 0.8rem;
        font-weight: 700;
        color: #f8fafc;
      }
      .trace-detail {
        margin: 4px 0 0;
        font-size: 0.72rem;
        line-height: 1.45;
        color: var(--muted);
      }
    `,
  ],
})
export class AutoEntryPanelComponent implements OnInit, OnDestroy {
  private readonly api = inject(DeckApiService);
  private readonly notify = inject(NotificationService);
  private requestSub: Subscription | null = null;

  readonly guardStatus = input<string | null | undefined>(null);
  readonly guardMessage = input<string | null | undefined>(null);
  readonly confirmationCount = input<number | null | undefined>(null);
  readonly confirmationsRequired = input<number | null | undefined>(null);
  readonly pendingAction = input<string | null | undefined>(null);
  readonly pendingReason = input<string | null | undefined>(null);
  readonly lastEvaluatedAt = input<string | null | undefined>(null);
  readonly recentEvents = input<AutoEntryTraceEvent[] | null | undefined>([]);
  readonly saved = output<AutoEntrySnapshot>();
  readonly snapshot = signal<AutoEntrySnapshot | null>(null);

  ngOnInit(): void {
    this.requestSub?.unsubscribe();
    this.requestSub = this.api.getAutoEntry().subscribe({
      next: (s) => this.snapshot.set(s),
      error: (err) => this.notify.error(err?.message || 'Failed to load auto-entry'),
    });
  }

  ngOnDestroy(): void {
    this.requestSub?.unsubscribe();
    this.requestSub = null;
  }

  statusClass(): string {
    const guard = this.guardStatus();
    if (guard === 'blocked') return 'pending';
    if (guard === 'simulated') return 'watching';
    if (guard === 'watching' || guard === 'pending') return guard;
    if (guard === 'executed') return 'executed';
    const s = this.snapshot();
    if (!s?.enabled) return 'off';
    if (s.session && !s.session.canEnter && !s.dryRun) return 'pending';
    return 'watching';
  }

  statusLabel(): string {
    const guard = this.guardStatus();
    if (guard === 'blocked') return 'Blocked';
    if (guard === 'simulated') return 'Paper';
    if (guard === 'pending') return 'Pending';
    if (guard === 'executed') return 'Live';
    if (guard === 'watching') return this.snapshot()?.dryRun ? 'Paper' : 'Watching';
    const s = this.snapshot();
    if (!s?.enabled) return 'Off';
    if (s.dryRun) return 'Paper';
    if (s.armedLive) return 'Live armed';
    if (s.session && !s.session.canEnter) return 'Blocked';
    return 'Disarmed';
  }

  liveStatus(): string {
    return (
      this.guardMessage() ||
      'Server-side guard runs independently of this browser tab when armed and Fyers is connected.'
    );
  }

  fastPresets(group: AutoEntrySnapshot['signalPresetGroups'][number]) {
    return group.presets.filter((p) => p.id !== 'engine');
  }

  profileHint(): string {
    const s = this.snapshot();
    if (!s || s.signalMode !== 'single') return '';
    const preset = s.signalPresetGroups
      .flatMap((g) => g.presets)
      .find((p) => p.id === s.signalProfile);
    if (!preset?.gates?.length) return '';
    return preset.gates.join(' · ');
  }

  onDryRunChange(checked: boolean): void {
    this.patch({
      dryRun: checked,
      ...(checked ? { armedLive: false } : {}),
    });
  }

  onArmedLiveChange(checked: boolean): void {
    if (checked) {
      this.patch({ dryRun: false, armedLive: true });
      return;
    }
    this.patch({ armedLive: false });
  }

  onSignalModeChange(mode: 'engine' | 'single'): void {
    const s = this.snapshot();
    if (!s) return;
    if (mode === 'engine') {
      this.patch({ signalMode: 'engine', signalProfile: 'engine' });
      return;
    }
    const fallback =
      this.fastPresets(s.signalPresetGroups[0] ?? { presets: [] })[0]?.id ??
      'breakout-vol';
    const profile =
      s.signalProfile !== 'engine' ? s.signalProfile : fallback;
    this.patch({ signalMode: 'single', signalProfile: profile });
  }

  patch(patch: Partial<AutoEntrySnapshot>): void {
    this.requestSub?.unsubscribe();
    this.requestSub = this.api.patchAutoEntry(patch).subscribe({
      next: (s) => {
        this.snapshot.set(s);
        this.saved.emit(s);
        this.notify.success('Auto-entry updated');
      },
      error: (err) => this.notify.error(err?.error?.error || err.message || 'Update failed'),
    });
  }
}