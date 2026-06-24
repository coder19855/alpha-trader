import { CommonModule } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AutoExitSnapshot,
  DeckLiveTick,
} from '../../core/models/deck.models';
import { DeckApiService } from '../../core/services/deck-api.service';
import { NotificationService } from '../../core/services/notification.service';

type AutoExitGuardDetail = NonNullable<
  DeckLiveTick['managementContext']
>['autoExit'];

@Component({
  selector: 'app-auto-exit-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
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
        <strong>MARKET sell</strong> orders on watched index option legs.
        Exits watch <strong>index spot</strong> (PA stops/trails) and
        <strong>option premium</strong> (WS LTP vs buy avg) — whichever triggers first.
      </p>

      @if (guardDetail(); as g) {
        <div class="exit-live-card">
          <div class="exit-live-row">
            <span class="exit-live-label">Live status</span>
            <span class="exit-live-val">{{ g.message || '—' }}</span>
          </div>
          @if (g.indexSpot != null) {
            <div class="exit-live-row">
              <span class="exit-live-label">Index spot</span>
              <span class="exit-live-val">{{ g.indexSpot | number: '1.0-2' }}</span>
            </div>
          }
          @if (g.peakR != null) {
            <div class="exit-live-row">
              <span class="exit-live-label">Peak R (index)</span>
              <span class="exit-live-val">{{ g.peakR | number: '1.2-2' }}R</span>
            </div>
          }
          @if (g.trailStopPrice != null) {
            <div class="exit-live-row">
              <span class="exit-live-label">{{ g.trailStopLabel || 'Trail stop' }}</span>
              <span class="exit-live-val">{{ g.trailStopPrice | number: '1.0-0' }}</span>
            </div>
          }
          @if (g.trailFloorPrice != null && g.trailFloorPrice !== g.trailStopPrice) {
            <div class="exit-live-row">
              <span class="exit-live-label">R:R floor</span>
              <span class="exit-live-val">{{ g.trailFloorPrice | number: '1.0-0' }}</span>
            </div>
          }
          @if (g.pendingHitLevel) {
            <div class="exit-live-row">
              <span class="exit-live-label">Pending trigger</span>
              <span class="exit-live-val hit-level">{{ formatHitLevel(g.pendingHitLevel) }}</span>
            </div>
          }
          @if (g.confirmationsRequired != null && g.confirmationCount != null) {
            <div class="exit-live-row">
              <span class="exit-live-label">Confirmations</span>
              <span class="exit-live-val">
                {{ g.confirmationCount }} / {{ g.confirmationsRequired }}
                @if (g.retestCount != null && g.retestCount > 0) {
                  <span class="muted-inline">(+{{ g.retestCount }} retest)</span>
                }
              </span>
            </div>
          }
          @if (g.scaleOutNote) {
            <p class="exit-scale-note">{{ g.scaleOutNote }}</p>
          }
        </div>

        @if (g.optionLegs?.length) {
          <div class="option-legs-card">
            <div class="option-legs-head">Option premium (WS)</div>
            @for (leg of g.optionLegs; track leg.symbol) {
              <div class="option-leg-row">
                <div class="option-leg-main">
                  <span class="option-leg-label">{{ leg.optionLabel }}</span>
                  <span class="option-leg-prices">
                    LTP <strong>{{ leg.ltp != null ? (leg.ltp | number: '1.2-2') : '—' }}</strong>
                    · Avg <strong>{{ leg.buyAvg | number: '1.2-2' }}</strong>
                  </span>
                </div>
                <div class="option-leg-side">
                  @if (leg.pnlPct != null) {
                    <span
                      class="option-leg-pnl"
                      [class.positive]="leg.pnlPct >= 0"
                      [class.negative]="leg.pnlPct < 0"
                    >
                      {{ leg.pnlPct >= 0 ? '+' : '' }}{{ leg.pnlPct | number: '1.1-1' }}%
                    </span>
                  }
                  @if (leg.delta != null || leg.theta != null) {
                    <span class="option-leg-greeks muted-inline">
                      @if (leg.delta != null) { Δ {{ leg.delta | number: '1.2-2' }} }
                      @if (leg.theta != null) { Θ {{ leg.theta | number: '1.1-1' }} }
                    </span>
                  }
                </div>
              </div>
            }
          </div>
        }

        @if (g.lastEvaluatedAt) {
          <p class="auto-exit-live-status trace-updated">
            Last evaluated: {{ g.lastEvaluatedAt | date: 'shortTime' }}
          </p>
        }

        @if (g.recentEvents; as events) {
          @if (events.length) {
          <div class="trace-card">
            <div class="trace-head">
              <span>Auto-exit trace</span>
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
        }
      }

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
          <label class="auto-exit-toggle">
            <input
              type="checkbox"
              [disabled]="!s.enabled"
              [ngModel]="s.optionPremiumExit"
              (ngModelChange)="patch({ optionPremiumExit: $event })"
            />
            <span>Option premium hard stop (WS LTP)</span>
          </label>
          <label class="auto-exit-retest">
            <span>Premium stop %</span>
            <select
              [disabled]="!s.enabled || !s.optionPremiumExit"
              [ngModel]="s.optionPremiumStopPct"
              (ngModelChange)="patch({ optionPremiumStopPct: +$event })"
            >
              @for (n of [20, 30, 40, 50, 60, 70]; track n) {
                <option [value]="n">{{ n }}%</option>
              }
            </select>
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
            <span>Retest count</span>
            <select
              [ngModel]="s.retestCount"
              (ngModelChange)="patch({ retestCount: +$event })"
            >
              @for (n of [0, 1, 2, 3, 4, 5]; track n) {
                <option [value]="n">{{ n }}</option>
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
        <p class="auto-exit-policy-hint partial-lot-hint">
          <strong>Index STOP_LOSS</strong> and <strong>option premium stop</strong> fire immediately.
          Trail / flip / session exits need {{ 1 + s.retestCount }} consecutive polls.
          <strong>1-lot</strong> positions skip partial scale-out.
        </p>
      }
      @if (!guardDetail()) {
        <p class="auto-exit-live-status muted">
          Open a watched index option leg to see live exit telemetry (index + option premium, trace log).
        </p>
      }
    </section>
  `,
  styles: [
    `
      .exit-live-card {
        margin: 10px 0 12px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(251, 191, 36, 0.28);
        background: rgba(251, 191, 36, 0.06);
      }
      .option-legs-card {
        margin: 0 0 12px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(34, 211, 238, 0.22);
        background: rgba(34, 211, 238, 0.05);
      }
      .option-legs-head {
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .option-leg-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 0;
        border-top: 1px solid rgba(148, 163, 184, 0.1);
        font-size: 0.72rem;
      }
      .option-leg-row:first-of-type {
        border-top: 0;
        padding-top: 0;
      }
      .option-leg-main {
        min-width: 0;
      }
      .option-leg-label {
        display: block;
        font-weight: 700;
        color: #e8ecf1;
      }
      .option-leg-prices {
        color: var(--muted);
      }
      .option-leg-side {
        text-align: right;
        flex-shrink: 0;
      }
      .option-leg-pnl {
        display: block;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }
      .option-leg-pnl.positive {
        color: #4ade80;
      }
      .option-leg-pnl.negative {
        color: #f87171;
      }
      .option-leg-greeks {
        display: block;
        margin-top: 2px;
        font-size: 0.64rem;
      }
      .exit-live-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 0.72rem;
        line-height: 1.45;
        margin-bottom: 6px;
      }
      .exit-live-row:last-child {
        margin-bottom: 0;
      }
      .exit-live-label {
        color: var(--muted);
        flex-shrink: 0;
      }
      .exit-live-val {
        text-align: right;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .hit-level {
        color: #fbbf24;
        text-transform: uppercase;
        font-size: 0.68rem;
        letter-spacing: 0.04em;
      }
      .exit-scale-note {
        margin: 8px 0 0;
        font-size: 0.68rem;
        color: var(--muted);
      }
      .muted-inline {
        color: var(--muted);
        font-weight: 400;
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
export class AutoExitPanelComponent implements OnInit {
  private readonly api = inject(DeckApiService);
  private readonly notify = inject(NotificationService);

  readonly guardDetail = input<AutoExitGuardDetail | null | undefined>(null);
  readonly saved = output<AutoExitSnapshot>();

  readonly snapshot = signal<AutoExitSnapshot | null>(null);

  readonly guardStatus = computed(() => this.guardDetail()?.status ?? null);

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
    if (guard === 'blocked') return 'blocked';
    if (this.snapshot()?.enabled) return 'watching';
    return 'off';
  }

  statusLabel(): string {
    const guard = this.guardStatus();
    if (guard === 'pending') return 'Pending';
    if (guard === 'executed') return 'Executed';
    if (guard === 'watching') return 'Armed';
    if (guard === 'blocked') return 'Blocked';
    return this.snapshot()?.enabled ? 'Armed' : 'Off';
  }

  formatHitLevel(level: string): string {
    return level.replace(/_/g, ' ');
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