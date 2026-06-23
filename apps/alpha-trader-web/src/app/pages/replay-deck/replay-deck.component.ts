import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LoaderComponent } from '../../shared/loader/loader.component';
import {
  ChartOverlayLine,
  DeckReplayPayload,
} from '../../core/models/deck.models';
import { DeckContextService } from '../../core/services/deck-context.service';
import { DeckApiService } from '../../core/services/deck-api.service';
import { NotificationService } from '../../core/services/notification.service';
import { BipolarListComponent } from '../../shared/bipolar-list/bipolar-list.component';
import { DeckChartsComponent } from '../../shared/deck-charts/deck-charts.component';
import { EventListComponent } from '../../shared/event-list/event-list.component';
import { PaDrilldownComponent } from '../../shared/pa-drilldown/pa-drilldown.component';
import { PaGaugeComponent } from '../../shared/pa-gauge/pa-gauge.component';
import { PaSignalInsightsComponent } from '../../shared/pa-signal-insights/pa-signal-insights.component';
import { PaTradeSetupComponent } from '../../shared/pa-trade-setup/pa-trade-setup.component';
import { PaComponentSignalsComponent } from '../../shared/pa-component-signals/pa-component-signals.component';
import { PaSignalBriefComponent } from '../../shared/pa-signal-brief/pa-signal-brief.component';
import { DeckGaugeReading } from '../../core/models/deck.models';
import { MarketRegimeComponent } from '../../shared/market-regime/market-regime.component';
import { VetoBreakupComponent } from '../../shared/veto-breakup/veto-breakup.component';
import { VetoStripComponent } from '../../shared/veto-strip/veto-strip.component';
import { StrategyPanelComponent } from '../../shared/strategy-panel/strategy-panel.component';
import { PositionsListComponent } from '../../shared/positions-list/positions-list.component';
import { MarketNewsPanelComponent } from '../../shared/market-news-panel/market-news-panel.component';
import { TradeJournalListComponent } from '../../shared/trade-journal-list/trade-journal-list.component';
import { SignalReadoutHelpComponent } from '../../shared/signal-readout-help/signal-readout-help.component';
import { ComponentsHelpComponent } from '../../shared/components-help/components-help.component';
import { PositionSizingComponent } from '../../shared/position-sizing/position-sizing.component';

type PaSignalSubTab = 'brief' | 'overview' | 'timeframes' | 'context';

@Component({
  selector: 'app-replay-deck',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatProgressSpinnerModule,
    LoaderComponent,
    PaGaugeComponent,
    PaSignalInsightsComponent,
    PaTradeSetupComponent,
    PaComponentSignalsComponent,
    PaSignalBriefComponent,
    BipolarListComponent,
    PaDrilldownComponent,
    VetoBreakupComponent,
    DeckChartsComponent,
    EventListComponent,
    MarketRegimeComponent,
    VetoStripComponent,
    StrategyPanelComponent,
    PositionsListComponent,
    MarketNewsPanelComponent,
    TradeJournalListComponent,
    SignalReadoutHelpComponent,
    ComponentsHelpComponent,
    PositionSizingComponent,
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
        <app-loader message="Loading replay…" sub="Preparing session data…" />
      }

      @if (payload(); as data) {
        @if (data.vetoTimeline?.length || data.replayPoints.length) {
          <div class="session-rail has-replay-scrub">
            @if (data.replayPoints.length) {
              <div class="replay-dock">
                <div class="replay-meta">
                  <span
                    >{{ scrubIndex() + 1 }} /
                    {{ data.replayPoints.length }}</span
                  >
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

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'signal'"
        >
          <app-signal-readout-help />
          <section class="signal-blend-banner" aria-label="Blended signal score">
            <span class="signal-blend-label">Blended score</span>
            <span class="signal-blend-value">
              {{ data.weightedBaseConviction ?? data.lanes?.combinedPercent }}%
            </span>
            <span class="signal-blend-breakdown">
              PA {{ data.lanes?.priceActionPercent }}% · Option
              {{ data.lanes?.optionPercent }}%
            </span>
          </section>
          <section class="action-card">
            <div class="action-main">
              <span class="action-label">{{ scrubbed()?.action || '—' }}</span>
              <div class="entry-conviction">
                <span class="entry-conviction-label">Conviction</span>
                <span class="entry-conviction-value">
                  <span class="conviction"
                    >{{ scrubbed()?.conviction ?? 0 }}%</span
                  >
                </span>
              </div>
            </div>
            <p class="status-line">
              Spot {{ scrubbed()?.spot | number: '1.2-2' }}
              @if (scrubbed()?.vetoed) {
                <span class="settings-preview-tag">Vetoed</span>
              }
              @if (scrubbed()?.whatIfAction && scrubbed()!.whatIfAction !== scrubbed()!.action) {
                <span class="settings-preview-tag">
                  What-if {{ scrubbed()!.whatIfAction }} · {{ scrubbed()!.whatIfConviction }}%
                </span>
              }
            </p>
            <app-market-regime [regime]="data.marketRegime" />
          </section>

          <nav class="signal-subtabs pa-signal-subtabs" aria-label="Price action views">
            <button
              type="button"
              class="signal-subtab"
              [class.active]="paSubTab() === 'overview'"
              (click)="paSubTab.set('overview')"
            >
              Overview
            </button>
            <button
              type="button"
              class="signal-subtab"
              [class.active]="paSubTab() === 'timeframes'"
              (click)="paSubTab.set('timeframes')"
            >
              Timeframes
            </button>
            <button
              type="button"
              class="signal-subtab"
              [class.active]="paSubTab() === 'context'"
              (click)="paSubTab.set('context')"
            >
              Context
            </button>
            <button
              type="button"
              class="signal-subtab"
              [class.active]="paSubTab() === 'brief'"
              (click)="paSubTab.set('brief')"
            >
              Brief
            </button>
          </nav>

          @if (paSubTab() === 'overview') {
            <div class="pa-signal-subpanel">
              <app-pa-gauge
                [reading]="scrubbedPaReading(data)"
                [paPercent]="
                  scrubbed()?.paPercent ?? data.gauges.priceAction.percent
                "
                [combinedPercent]="
                  scrubbed()?.paPercent ??
                  data.lanes?.combinedPercent ??
                  data.gauges.priceAction.percent
                "
                [hideCombinedLane]="true"
                [weightedBaseConviction]="
                  data.paBaseConviction ??
                  data.weightedBaseConviction ??
                  scrubbed()?.conviction ??
                  data.entryThreshold
                "
                [entryConviction]="scrubbed()?.conviction ?? 0"
                [convictionBonuses]="data.convictionBonuses ?? []"
                [paConvictionBonuses]="data.paConvictionBonuses ?? []"
                [paBaseConviction]="data.paBaseConviction"
              />
              <app-pa-signal-insights
                view="overview"
                [action]="scrubbed()?.action ?? data.gauges.priceAction.label"
                [structuralAction]="scrubbed()?.structuralAction"
                [vetoReason]="scrubbed()?.vetoReason"
                [chartVetoed]="!!scrubbed()?.vetoed"
                [conviction]="scrubbed()?.conviction ?? 0"
                [entryThreshold]="data.entryThreshold"
                [paDrilldown]="scrubbedPaDrilldown(data)"
                [patternInsights]="scrubbed()?.patternInsights ?? data.patternInsights"
                [convictionSeries]="replayConvictionSeries(data)"
                [reading]="scrubbedPaReading(data)"
                [marketRegime]="data.marketRegime"
              />
              <app-pa-trade-setup [setup]="scrubbed()?.tradeSetup" />
            </div>
          } @else if (paSubTab() === 'timeframes') {
            <div class="pa-signal-subpanel">
              <app-pa-signal-insights
                view="timeframes"
                [action]="scrubbed()?.action ?? data.gauges.priceAction.label"
                [structuralAction]="scrubbed()?.structuralAction"
                [vetoReason]="scrubbed()?.vetoReason"
                [chartVetoed]="!!scrubbed()?.vetoed"
                [conviction]="scrubbed()?.conviction ?? 0"
                [entryThreshold]="data.entryThreshold"
                [paDrilldown]="scrubbedPaDrilldown(data)"
                [patternInsights]="scrubbed()?.patternInsights ?? data.patternInsights"
                [convictionSeries]="replayConvictionSeries(data)"
                [reading]="scrubbedPaReading(data)"
                [marketRegime]="data.marketRegime"
              />
              <app-pa-component-signals
                [componentSignals]="scrubbed()?.componentSignals"
                [primaryTimeframe]="
                  scrubbed()?.paDrilldown?.primaryTimeframe ??
                  scrubbedPaDrilldown(data)?.primaryTimeframe ??
                  '15m'
                "
              />
            </div>
          } @else if (paSubTab() === 'context') {
            <div class="pa-signal-subpanel">
              <app-pa-signal-insights
                view="context"
                [action]="scrubbed()?.action ?? data.gauges.priceAction.label"
                [structuralAction]="scrubbed()?.structuralAction"
                [vetoReason]="scrubbed()?.vetoReason"
                [chartVetoed]="!!scrubbed()?.vetoed"
                [conviction]="scrubbed()?.conviction ?? 0"
                [entryThreshold]="data.entryThreshold"
                [paDrilldown]="scrubbedPaDrilldown(data)"
                [patternInsights]="scrubbed()?.patternInsights ?? data.patternInsights"
                [convictionSeries]="replayConvictionSeries(data)"
                [reading]="scrubbedPaReading(data)"
                [marketRegime]="data.marketRegime"
              />
            </div>
          } @else {
            <div class="pa-signal-subpanel">
              <app-pa-signal-brief
                [trackHistory]="false"
                [sessionKey]="data.symbol + ':' + data.sessionDate"
                [signalAt]="scrubbedSignalAt()"
                [action]="scrubbed()?.action ?? data.gauges.priceAction.label"
                [structuralAction]="scrubbed()?.structuralAction"
                [conviction]="scrubbed()?.conviction ?? 0"
                [entryThreshold]="data.entryThreshold"
                [chartVetoed]="!!scrubbed()?.vetoed"
                [vetoReason]="scrubbed()?.vetoReason"
                [lastPrice]="scrubbed()?.spot"
                [paDrilldown]="scrubbedPaDrilldown(data)"
                [tradeSetup]="scrubbed()?.tradeSetup"
                [marketRegime]="data.marketRegime"
                [patternInsights]="scrubbed()?.patternInsights ?? data.patternInsights"
                [reading]="scrubbedPaReading(data)"
                [primaryTimeframe]="
                  scrubbed()?.paDrilldown?.primaryTimeframe ??
                  scrubbedPaDrilldown(data)?.primaryTimeframe ??
                  '15m'
                "
              />
            </div>
          }
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'components'"
        >
          <section class="component-panel">
            <app-components-help />
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
              Bipolar scale: <strong>−1</strong> bearish ·
              <strong>0</strong> flat · <strong>+1</strong> bullish.
            </p>
            <div class="component-list">
              <app-bipolar-list
                [components]="scrubbedPaComponents(data)"
                variant="priceAction"
              />
            </div>
            @if (drilldownOpen()) {
              <div class="pa-drilldown">
                <app-pa-drilldown [drilldown]="scrubbedPaDrilldown(data)" />
              </div>
            }
          </section>
        </section>

        <section class="tab-panel" [class.active]="ctx.activeTab() === 'veto'">
          <section
            class="veto-tab-panel"
            [class.has-block]="hasVetoBlock(data)"
          >
            @if (data.vetoTimeline?.length) {
              <app-veto-strip [timeline]="data.vetoTimeline ?? []" />
            }
            <section class="veto-breakup-block">
              <div class="panel-head">
                <span>Veto breakup</span>
                <span class="panel-note">{{ vetoSummary(data) }}</span>
              </div>
              @if (scrubbed()?.vetoReason) {
                <p class="veto-breakup-note" role="status">
                  {{ scrubbed()!.vetoReason }}
                </p>
              }
              <div class="veto-breakup-list">
                <app-veto-breakup [items]="data.vetoBreakup" />
              </div>
            </section>
          </section>
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'strategy'"
        >
          <app-strategy-panel [strategy]="scrubbedStrategy(data)" />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'sizing'"
        >
          <app-position-sizing
            [symbol]="data.symbol"
            [lotSize]="data.lotSize"
          />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'charts'"
        >
          <app-deck-charts
            [tabActive]="ctx.activeTab() === 'charts'"
            [spotCandles]="data.spotCandles"
            [spotCandles5m]="data.spotCandles5m ?? []"
            [spotCandles15m]="data.spotCandles15m ?? []"
            [spotCandles1h]="data.spotCandles1h ?? []"
            [spotSeries]="data.spotSeries"
            [patternInsights]="
              scrubbed()?.patternInsights ?? data.patternInsights
            "
            [chartPatternNeckline]="scrubbed()?.chartPatternNeckline"
            [chartOverlays]="chartOverlays(scrubbed(), data)"
            [scrubTime]="scrubbed()?.t ?? null"
          />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'news'"
        >
          <app-market-news-panel
            [symbol]="ctx.symbol()"
            [tabActive]="ctx.activeTab() === 'news'"
          />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'events'"
        >
          <app-event-list [events]="data.events.slice(-20).reverse()" />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'journal'"
        >
          <app-trade-journal-list
            [symbol]="ctx.symbol()"
            [tabActive]="ctx.activeTab() === 'journal'"
          />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'positions'"
        >
          <app-positions-list
            [entries]="[]"
            [note]="
              'Open positions hidden in replay (historical session view).'
            "
          />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'settings'"
        >
          <section class="settings-panel">
            <p class="settings-preview-tag">
              Replay preview — settings are read-only.
            </p>
            <p class="muted settings-mode-note">
              Trading style: {{ data.tradingStyle }} · Session
              {{ data.sessionDate }}
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
      .signal-subtabs {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
      }
      .signal-blend-banner {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-bottom: 10px;
        padding: 10px 12px;
        border: 1px solid rgba(167, 139, 250, 0.28);
        border-radius: 12px;
        background: linear-gradient(90deg, rgba(167, 139, 250, 0.12), transparent);
        color: var(--text);
        flex-wrap: wrap;
      }
      .signal-blend-label {
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .signal-blend-value {
        font-size: 1rem;
        font-weight: 800;
        color: #c4b5fd;
      }
      .signal-blend-breakdown {
        font-size: 0.72rem;
        color: var(--muted);
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
      .signal-subtab.active {
        color: var(--option);
        border-color: rgba(34, 211, 238, 0.4);
        background: rgba(34, 211, 238, 0.1);
      }
      .pa-signal-subtabs {
        margin-top: 2px;
        margin-bottom: 10px;
      }
      .pa-signal-subtabs .signal-subtab.active {
        color: #c4b5fd;
        border-color: rgba(167, 139, 250, 0.45);
        background: rgba(167, 139, 250, 0.12);
      }
      .pa-signal-subpanel {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
    `,
  ],
})
export class ReplayDeckComponent implements OnInit {
  private readonly deckApi = inject(DeckApiService);
  private readonly notify = inject(NotificationService);
  readonly ctx = inject(DeckContextService);
  protected readonly Math = Math;

  sessionDate = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });
  readonly scrubIndex = signal(0);
  readonly payload = signal<DeckReplayPayload | null>(null);
  readonly loading = signal(false);
  readonly drilldownOpen = signal(true);
  readonly paSubTab = signal<PaSignalSubTab>('overview');

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

  scrubbedSignalAt(): string {
    const t = this.scrubbed()?.t;
    if (t != null && Number.isFinite(t)) {
      return new Date(t).toISOString();
    }
    return new Date().toISOString();
  }

  scrubbedPaReading(data: DeckReplayPayload): DeckGaugeReading {
    const point = this.scrubbed();
    const base = data.gauges.priceAction;
    if (!point) return base;
    const value = Number.isFinite(point.paNeedle) ? point.paNeedle : base.value;
    return {
      value,
      percent: point.paPercent ?? base.percent,
      label: value >= 0.35 ? 'CE' : value <= -0.35 ? 'PE' : 'FLAT',
      ghost: base.ghost ?? null,
    };
  }

  scrubbedPaDrilldown(data: DeckReplayPayload) {
    return this.scrubbed()?.paDrilldown ?? data.paDrilldown;
  }

  scrubbedPaComponents(data: DeckReplayPayload) {
    return this.scrubbed()?.paComponents ?? data.priceActionComponents ?? [];
  }

  replayConvictionSeries(data: DeckReplayPayload) {
    return data.replayPoints.map((point) => ({
      t: point.t,
      option: point.optionPercent,
      priceAction: point.paPercent,
      combined: point.conviction,
    }));
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
    const pattern = (point?.patternInsights ?? data.patternInsights)?.find(
      (p) => p.label === 'Chart Pattern',
    );
    const patternColor = this.resolvePatternColor(pattern?.pattern, pattern?.tone);
    const overlays: ChartOverlayLine[] = [];
    if (section) {
      for (const row of section.rows) {
        const value = Number.parseFloat(
          String(row.value).replace(/[^\d.-]/g, ''),
        );
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
        id: 'chartPattern',
        label: pattern?.pattern ? `${this.displayPatternName(pattern.pattern)} neckline` : 'Neckline',
        price: neckline!,
        color: patternColor,
        kind: 'hline',
      });
    }
    return overlays;
  }

  private displayPatternName(pattern: string): string {
    return pattern.replace(/_/g, ' ');
  }

  private resolvePatternColor(pattern?: string, tone?: string): string {
    const normalized = (pattern ?? '').toLowerCase();
    if (
      normalized.includes('double top') ||
      normalized.includes('head and shoulders') ||
      normalized.includes('rising wedge') ||
      normalized.includes('bear flag') ||
      normalized.includes('descending triangle') ||
      normalized.includes('trendline break bear')
    ) {
      return '#ef4444';
    }
    if (
      normalized.includes('double bottom') ||
      normalized.includes('inverse head and shoulders') ||
      normalized.includes('falling wedge') ||
      normalized.includes('bull flag') ||
      normalized.includes('ascending triangle') ||
      normalized.includes('trendline break bull')
    ) {
      return '#22c55e';
    }
    if ((tone ?? '').toLowerCase() === 'bear') return '#fb923c';
    if ((tone ?? '').toLowerCase() === 'bull') return '#4ade80';
    return '#a78bfa';
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
    this.deckApi
      .getReplay(this.ctx.symbol(), this.ctx.style(), this.sessionDate)
      .subscribe({
        next: (data) => {
          this.payload.set(data);
          this.scrubIndex.set(Math.max(0, data.replayPoints.length - 1));
          const points = data.replayPoints ?? [];
          const first = points[0];
          const lastSpot = points.at(-1)?.spot ?? null;
          const dayChange =
            first?.spot != null && lastSpot != null ? lastSpot - first.spot : null;
          const dayChangePct =
            first?.spot != null && lastSpot != null && first.spot > 0
              ? ((lastSpot - first.spot) / first.spot) * 100
              : null;
          this.ctx.updateTracker({
            symbol: data.symbol,
            symbolLabel: data.symbolLabel,
            price: lastSpot,
            dayChange,
            dayChangePct,
            style: data.tradingStyle,
            connected: true,
            live: false,
            asOf: new Date().toISOString(),
          });
          this.loading.set(false);
        },
        error: (err) => {
          this.notify.error(
            err?.error?.error || err.message || 'Replay failed',
          );
          this.loading.set(false);
        },
      });
  }
}
