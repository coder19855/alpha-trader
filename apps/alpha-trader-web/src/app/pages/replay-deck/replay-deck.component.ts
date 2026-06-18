import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChartOverlayLine, DeckReplayPayload } from '../../core/models/deck.models';
import { DeckContextService } from '../../core/services/deck-context.service';
import { DeckApiService } from '../../core/services/deck-api.service';
import { NotificationService } from '../../core/services/notification.service';
import { BipolarListComponent } from '../../shared/bipolar-list/bipolar-list.component';
import { DeckChartsComponent } from '../../shared/deck-charts/deck-charts.component';
import { EventListComponent } from '../../shared/event-list/event-list.component';
import { PaDrilldownComponent } from '../../shared/pa-drilldown/pa-drilldown.component';
import { PaGaugeComponent } from '../../shared/pa-gauge/pa-gauge.component';
import { MarketRegimeComponent } from '../../shared/market-regime/market-regime.component';
import { VetoBreakupComponent } from '../../shared/veto-breakup/veto-breakup.component';
import { VetoStripComponent } from '../../shared/veto-strip/veto-strip.component';
import { StrategyPanelComponent } from '../../shared/strategy-panel/strategy-panel.component';
import { PositionsListComponent } from '../../shared/positions-list/positions-list.component';

@Component({
  selector: 'app-replay-deck',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatProgressSpinnerModule,
    PaGaugeComponent,
    BipolarListComponent,
    PaDrilldownComponent,
    VetoBreakupComponent,
    DeckChartsComponent,
    EventListComponent,
    MarketRegimeComponent,
    VetoStripComponent,
    StrategyPanelComponent,
    PositionsListComponent,
  ],
  template: `
    <section class="deck-page">
      <div class="settings-group">
        <div class="settings-group-head">
          <p class="settings-group-title">Session date</p>
        </div>
        <div class="settings-control">
          <input
            class="settings-select"
            type="date"
            [ngModel]="sessionDate"
            (ngModelChange)="onDateChange($event)"
          />
        </div>
      </div>

      @if (loading()) {
        <div class="loading-overlay" aria-live="polite">
          <mat-spinner diameter="36" />
          <span class="loading-text">Loading replay…</span>
        </div>
      }

      @if (payload(); as data) {
        @if (data.vetoTimeline?.length || data.replayPoints.length) {
          <div class="session-rail has-replay-scrub">
            @if (data.vetoTimeline?.length) {
              <app-veto-strip [timeline]="data.vetoTimeline ?? []" />
            }
            @if (data.replayPoints.length) {
            <div class="replay-dock">
              <div class="replay-meta">
                <span>{{ scrubIndex() + 1 }} / {{ data.replayPoints.length }}</span>
                @if (scrubbed()?.t) {
                  <span>{{ formatScrubTime(scrubbed()!.t) }}</span>
                }
              </div>
              <input
                type="range"
                class="replay-slider"
                min="0"
                [max]="Math.max(0, data.replayPoints.length - 1)"
                [ngModel]="scrubIndex()"
                (ngModelChange)="scrubIndex.set($event)"
              />
            </div>
            }
          </div>
        }

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'signal'">
          <section class="action-card">
            <div class="action-main">
              <span class="action-label">{{ scrubbed()?.action || '—' }}</span>
              <div class="entry-conviction">
                <span class="entry-conviction-label">Conviction</span>
                <span class="entry-conviction-value">
                  <span class="conviction">{{ scrubbed()?.conviction ?? 0 }}%</span>
                </span>
              </div>
            </div>
            <p class="status-line">
              Spot {{ scrubbed()?.spot | number: '1.2-2' }}
              @if (scrubbed()?.vetoed) {
                <span class="settings-preview-tag">Vetoed</span>
              }
            </p>
            <app-market-regime [regime]="data.marketRegime" />
          </section>
          <app-pa-gauge
            [reading]="data.gauges.priceAction"
            [paPercent]="scrubbed()?.paPercent ?? data.gauges.priceAction.percent"
            [combinedPercent]="scrubbed()?.paPercent ?? data.lanes?.combinedPercent ?? data.gauges.priceAction.percent"
            [hideCombinedLane]="true"
            [weightedBaseConviction]="scrubbed()?.conviction ?? data.entryThreshold"
            [entryConviction]="scrubbed()?.conviction ?? 0"
          />
        </section>

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'components'">
          <section class="component-panel">
            <div class="panel-head">
              <span>Price action components</span>
              <button
                type="button"
                class="drilldown-toggle"
                [attr.aria-expanded]="drilldownOpen()"
                (click)="drilldownOpen.set(!drilldownOpen())"
              >
                Breakdown
              </button>
            </div>
            <p class="component-scale-hint">
              Bipolar scale: <strong>−1</strong> bearish · <strong>0</strong> flat ·
              <strong>+1</strong> bullish.
            </p>
            <div class="component-list">
              <app-bipolar-list
                [components]="data.priceActionComponents ?? []"
                variant="priceAction"
              />
            </div>
            @if (drilldownOpen()) {
              <div class="pa-drilldown">
                <app-pa-drilldown [drilldown]="data.paDrilldown" />
              </div>
            }
          </section>
        </section>

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'veto'">
          <section class="veto-tab-panel" [class.has-block]="hasVetoBlock(data)">
            <section class="veto-breakup-block">
              <div class="panel-head">
                <span>Veto breakup</span>
                <span class="panel-note">{{ vetoSummary(data) }}</span>
              </div>
              @if (scrubbed()?.vetoReason) {
                <p class="veto-breakup-note" role="status">{{ scrubbed()!.vetoReason }}</p>
              }
              <div class="veto-breakup-list">
                <app-veto-breakup [items]="data.vetoBreakup" />
              </div>
            </section>
          </section>
        </section>

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'strategy'">
          <app-strategy-panel [strategy]="scrubbedStrategy(data)" />
        </section>

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'charts'">
          <app-deck-charts
            [tabActive]="ctx.activeTab() === 'charts'"
            [spotCandles]="data.spotCandles"
            [spotCandles5m]="data.spotCandles5m ?? []"
            [spotCandles15m]="data.spotCandles15m ?? []"
            [spotCandles1h]="data.spotCandles1h ?? []"
            [spotSeries]="data.spotSeries"
            [patternInsights]="scrubbed()?.patternInsights ?? data.patternInsights"
            [chartPatternNeckline]="scrubbed()?.chartPatternNeckline"
            [chartOverlays]="chartOverlays(scrubbed(), data)"
            [scrubTime]="scrubbed()?.t ?? null"
          />
        </section>

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'events'">
          <app-event-list [events]="data.events.slice(-20).reverse()" />
        </section>

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'positions'">
          <app-positions-list
            [entries]="[]"
            [note]="'Open positions hidden in replay (historical session view).'"
          />
        </section>

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'settings'">
          <section class="settings-panel">
            <p class="settings-preview-tag">Replay preview — settings are read-only.</p>
            <p class="muted settings-mode-note">
              Trading style: {{ data.tradingStyle }} · Session {{ data.sessionDate }}
            </p>
          </section>
        </section>
      } @else if (!loading()) {
        <p class="muted">No replay data</p>
      }
    </section>
  `,
  styles: [
    `
      :host ::ng-deep .mat-mdc-progress-spinner {
        --mdc-circular-progress-active-indicator-color: var(--option);
      }
    `,
  ],
})
export class ReplayDeckComponent implements OnInit {
  private readonly deckApi = inject(DeckApiService);
  private readonly notify = inject(NotificationService);
  readonly ctx = inject(DeckContextService);
  protected readonly Math = Math;

  sessionDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  readonly scrubIndex = signal(0);
  readonly payload = signal<DeckReplayPayload | null>(null);
  readonly loading = signal(false);
  readonly drilldownOpen = signal(true);

  readonly scrubbed = computed(() => {
    const data = this.payload();
    if (!data?.replayPoints.length) return null;
    const idx = Math.min(this.scrubIndex(), data.replayPoints.length - 1);
    return data.replayPoints[idx];
  });

  ngOnInit(): void {
    this.load();
  }

  onDateChange(date: string): void {
    this.sessionDate = date;
    this.load();
  }

  formatScrubTime(t: number): string {
    return new Date(t).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  hasVetoBlock(data: DeckReplayPayload): boolean {
    return (data.vetoBreakup ?? []).some((item) => item.state === 'block');
  }

  scrubbedStrategy(data: DeckReplayPayload) {
    const point = this.scrubbed();
    if (!point) return data.strategyRecommendation;
    return {
      ...(data.strategyRecommendation ?? {
        action: point.action,
        bias: '—',
        conviction: point.conviction,
        recommendation: '',
        humanSummary: '',
        tradeGuidance: {
          shouldConsiderTrade: false,
          sizeRecommendation: 'Replay scrub — historical point.',
          notes: '',
        },
        strategies: [],
      }),
      action: point.action,
      conviction: point.conviction,
      replayNote: 'Strategy readout updates as you scrub the session timeline.',
    };
  }

  chartOverlays(
    point: DeckReplayPayload['replayPoints'][number] | null,
    data: DeckReplayPayload,
  ): ChartOverlayLine[] {
    const section = (point?.paDrilldown ?? data.paDrilldown)?.sections?.find(
      (s) => s.id === 'levels',
    );
    const overlays: ChartOverlayLine[] = [];
    if (section) {
      for (const row of section.rows) {
        const value = Number.parseFloat(String(row.value).replace(/[^\d.-]/g, ''));
        if (!Number.isFinite(value)) continue;
        if (row.label.toLowerCase().includes('support')) {
          overlays.push({
            id: 'support',
            label: 'Support',
            price: value,
            color: '#22d3ee',
            kind: 'hline',
          });
        }
        if (row.label.toLowerCase().includes('resistance')) {
          overlays.push({
            id: 'resistance',
            label: 'Resistance',
            price: value,
            color: '#f472b6',
            kind: 'hline',
          });
        }
      }
    }
    const neckline = point?.chartPatternNeckline;
    if (Number.isFinite(neckline)) {
      overlays.push({
        id: 'pattern',
        label: 'Neckline',
        price: neckline!,
        color: '#a78bfa',
        kind: 'hline',
      });
    }
    return overlays;
  }

  vetoSummary(data: DeckReplayPayload): string {
    const items = data.vetoBreakup ?? [];
    const blocks = items.filter((i) => i.state === 'block').length;
    const warns = items.filter((i) => i.state === 'warn').length;
    if (blocks) return `${blocks} block${blocks > 1 ? 's' : ''}`;
    if (warns) return `${warns} warn${warns > 1 ? 's' : ''}`;
    return 'All clear';
  }

  load(): void {
    this.loading.set(true);
    this.deckApi.getReplay(this.ctx.symbol(), this.ctx.style(), this.sessionDate).subscribe({
      next: (data) => {
        this.payload.set(data);
        this.scrubIndex.set(Math.max(0, data.replayPoints.length - 1));
        this.ctx.updateTracker({
          symbol: data.symbol,
          symbolLabel: data.symbolLabel,
          price: data.replayPoints.at(-1)?.spot ?? null,
          style: data.tradingStyle,
          connected: true,
          live: false,
          asOf: new Date().toISOString(),
        });
        this.loading.set(false);
      },
      error: (err) => {
        this.notify.error(err?.error?.error || err.message || 'Replay failed');
        this.loading.set(false);
      },
    });
  }
}