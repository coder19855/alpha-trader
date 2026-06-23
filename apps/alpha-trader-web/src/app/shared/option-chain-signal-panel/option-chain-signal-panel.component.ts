import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { OptionChainPollService } from '../../core/services/option-chain-poll.service';
import { toOptionComponentGauges } from '../../core/models/option-chain.models';
import { formatSignalCalculatedAt } from '../../core/utils/format-signal-timestamp';
import { BipolarListComponent } from '../bipolar-list/bipolar-list.component';
import { OptionChainReadoutHelpComponent } from '../option-chain-readout-help/option-chain-readout-help.component';
import { OptionChainWidgetsComponent } from '../option-chain-widgets/option-chain-widgets.component';
import { OptionGaugeComponent } from '../option-gauge/option-gauge.component';
import { OptionGuardDashboardComponent } from '../option-guard-dashboard/option-guard-dashboard.component';
import { OptionSignalBriefComponent } from '../option-signal-brief/option-signal-brief.component';

type OcSignalSubTab = 'overview' | 'flow' | 'guards' | 'brief';

@Component({
  selector: 'app-option-chain-signal-panel',
  standalone: true,
  imports: [
    CommonModule,
    BipolarListComponent,
    OptionChainReadoutHelpComponent,
    OptionChainWidgetsComponent,
    OptionGaugeComponent,
    OptionGuardDashboardComponent,
    OptionSignalBriefComponent,
  ],
  template: `
    <app-option-chain-readout-help />

    @if (poll.error(); as err) {
      <p class="oc-error" role="alert">{{ err }}</p>
    }

    @if (poll.loading() && !poll.data()) {
      <p class="oc-loading">Waiting for server option chain…</p>
    }

    @if (poll.data(); as oc) {
      @if (oc.paAlignment === 'veto') {
        <p class="oc-veto" role="status">{{ oc.paAlignmentDetail }}</p>
      } @else if (oc.paAlignment === 'confirm') {
        <p class="oc-confirm" role="status">{{ oc.paAlignmentDetail }}</p>
      }

      <section class="action-card option-action-card">
        <div class="action-main">
          <span class="action-label">{{ signalLabel(oc.signal) }}</span>
          <div class="entry-conviction">
            <span class="entry-conviction-label">Flow</span>
            <span class="entry-conviction-value">
              <span class="conviction at-threshold">{{ oc.conviction }}%</span>
            </span>
          </div>
        </div>
        <p class="status-line">{{ oc.bias }} · {{ oc.ivRegime }}</p>
        <p class="signal-calc-stamp" role="status">
          Data fetched:
          <time [attr.datetime]="oc.fetchedAt">
            {{ formatFetchedAt(oc.fetchedAt) }}
          </time>
          @if (oc.cached) {
            <span class="cached-tag">cached</span>
          }
        </p>
      </section>

      <nav class="signal-subtabs oc-signal-subtabs" aria-label="Option chain views">
        <button
          type="button"
          class="signal-subtab"
          [class.active]="ocSubTab() === 'overview'"
          (click)="ocSubTab.set('overview')"
        >
          Overview
        </button>
        <button
          type="button"
          class="signal-subtab"
          [class.active]="ocSubTab() === 'flow'"
          (click)="ocSubTab.set('flow')"
        >
          Flow
        </button>
        <button
          type="button"
          class="signal-subtab"
          [class.active]="ocSubTab() === 'guards'"
          (click)="ocSubTab.set('guards')"
        >
          Guards
        </button>
        <button
          type="button"
          class="signal-subtab"
          [class.active]="ocSubTab() === 'brief'"
          (click)="ocSubTab.set('brief')"
        >
          Brief
        </button>
      </nav>

      @if (ocSubTab() === 'overview') {
        <div class="oc-signal-subpanel">
          <app-option-gauge [reading]="gaugeReading()" [conviction]="oc.conviction" />
          <app-option-chain-widgets [data]="oc" />
          <div class="oc-meta">
            <span>Score {{ oc.score | number: '1.0-0' }}</span>
            @if (oc.confidence?.percent != null) {
              <span>Confidence {{ oc.confidence!.percent }}%</span>
            }
          </div>
        </div>
      } @else if (ocSubTab() === 'flow') {
        <div class="oc-signal-subpanel">
          <p class="oc-panel-hint">
            Bipolar scale: <strong>−1</strong> bearish · <strong>0</strong> flat ·
            <strong>+1</strong> bullish.
          </p>
          <div class="component-list">
            <app-bipolar-list
              [components]="flowComponents()"
              variant="option"
            />
          </div>
        </div>
      } @else if (ocSubTab() === 'guards') {
        <div class="oc-signal-subpanel">
          <app-option-guard-dashboard [guardData]="oc.guard" />
        </div>
      } @else {
        <div class="oc-signal-subpanel">
          <app-option-signal-brief
            [sessionKey]="oc.symbol"
            [data]="oc"
          />
        </div>
      }
    } @else if (!poll.loading() && !poll.error()) {
      <p class="oc-empty">No option chain data yet. Use refresh to reconnect.</p>
    }
  `,
  styles: [
    `
      :host {
        --oc-call: #38bdf8;
        --oc-call-soft: rgba(56, 189, 248, 0.14);
        --oc-call-border: rgba(56, 189, 248, 0.38);
        --oc-put: #c4b5fd;
        --oc-put-soft: rgba(196, 181, 253, 0.14);
        --oc-put-border: rgba(196, 181, 253, 0.38);
        display: block;
      }
      :host ::ng-deep .gauge-zone.ce {
        background: linear-gradient(270deg, var(--oc-call-soft), transparent);
        color: var(--oc-call);
      }
      :host ::ng-deep .gauge-zone.pe {
        background: linear-gradient(90deg, var(--oc-put-soft), transparent);
        color: var(--oc-put);
      }
      .signal-subtabs {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
      }
      .signal-subtab {
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.03);
        color: var(--muted);
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
      }
      .oc-signal-subtabs .signal-subtab.active {
        color: var(--option);
        border-color: rgba(34, 211, 238, 0.45);
        background: rgba(34, 211, 238, 0.12);
      }
      .oc-signal-subpanel {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .oc-panel-hint {
        margin: 0 0 10px;
        font-size: 0.66rem;
        color: var(--muted);
        line-height: 1.4;
      }
      .oc-error {
        color: #f87171;
        font-size: 0.78rem;
        margin-bottom: 8px;
      }
      .oc-loading,
      .oc-empty {
        color: var(--muted);
        font-size: 0.78rem;
        margin-bottom: 8px;
      }
      .oc-veto {
        color: #f87171;
        font-size: 0.74rem;
        margin-bottom: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(248, 113, 113, 0.1);
        border: 1px solid rgba(248, 113, 113, 0.3);
      }
      .oc-confirm {
        color: #4ade80;
        font-size: 0.74rem;
        margin-bottom: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(74, 222, 128, 0.08);
        border: 1px solid rgba(74, 222, 128, 0.28);
      }
      .option-action-card {
        margin-bottom: 8px;
      }
      .cached-tag {
        margin-left: 6px;
        font-size: 0.62rem;
        color: var(--muted);
        text-transform: uppercase;
      }
      .oc-meta {
        display: flex;
        gap: 12px;
        font-size: 0.68rem;
        color: var(--muted);
        margin-top: 8px;
      }
    `,
  ],
})
export class OptionChainSignalPanelComponent {
  readonly poll = inject(OptionChainPollService);
  protected readonly formatFetchedAt = formatSignalCalculatedAt;
  readonly ocSubTab = signal<OcSignalSubTab>('overview');

  readonly gaugeReading = computed(() => {
    const oc = this.poll.data();
    if (!oc) {
      return { value: 0, percent: 0, label: 'FLAT' };
    }
    const value = Math.max(-1, Math.min(1, oc.score / 100));
    const label =
      value >= 0.35 ? 'CE' : value <= -0.35 ? 'PE' : 'FLAT';
    return {
      value,
      percent: oc.conviction,
      label,
    };
  });

  readonly flowComponents = computed(() => {
    const rows = this.poll.data()?.componentRows ?? [];
    return toOptionComponentGauges(rows);
  });

  signalLabel(signal: string): string {
    if (signal.includes('BULLISH')) return 'BULLISH FLOW';
    if (signal.includes('BEARISH')) return 'BEARISH FLOW';
    return 'NEUTRAL FLOW';
  }
}