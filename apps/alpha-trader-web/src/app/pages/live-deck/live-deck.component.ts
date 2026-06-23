import { CommonModule } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LoaderComponent } from '../../shared/loader/loader.component';
import { Subscription } from 'rxjs';
import {
  ChartOverlayLine,
  DeckLiveTick,
  SettingsSnapshot,
  TradingStyle,
} from '../../core/models/deck.models';
import { DeckContextService } from '../../core/services/deck-context.service';
import { DeckApiService } from '../../core/services/deck-api.service';
import { DeckStreamService } from '../../core/services/deck-stream.service';
import { DeckAlertService } from '../../core/services/deck-alert.service';
import { NotificationService } from '../../core/services/notification.service';
import { BipolarListComponent } from '../../shared/bipolar-list/bipolar-list.component';
import { DeckChartsComponent } from '../../shared/deck-charts/deck-charts.component';
import { PaDrilldownComponent } from '../../shared/pa-drilldown/pa-drilldown.component';
import { PaGaugeComponent } from '../../shared/pa-gauge/pa-gauge.component';
import { PositionsListComponent } from '../../shared/positions-list/positions-list.component';
import { AutoExitPanelComponent } from '../../shared/auto-exit-panel/auto-exit-panel.component';
import { AutoEntryPanelComponent } from '../../shared/auto-entry-panel/auto-entry-panel.component';
import { EventListComponent } from '../../shared/event-list/event-list.component';
import { MarketNewsPanelComponent } from '../../shared/market-news-panel/market-news-panel.component';
import { TradeJournalListComponent } from '../../shared/trade-journal-list/trade-journal-list.component';
import { MarketRegimeComponent } from '../../shared/market-regime/market-regime.component';
import { VetoBreakupComponent } from '../../shared/veto-breakup/veto-breakup.component';
import { VetoStripComponent } from '../../shared/veto-strip/veto-strip.component';
import { StrategyPanelComponent } from '../../shared/strategy-panel/strategy-panel.component';
import { SignalReadoutHelpComponent } from '../../shared/signal-readout-help/signal-readout-help.component';
import { ComponentsHelpComponent } from '../../shared/components-help/components-help.component';
import { PositionSizingComponent } from '../../shared/position-sizing/position-sizing.component';
import { OptionChainSignalPanelComponent } from '../../shared/option-chain-signal-panel/option-chain-signal-panel.component';
import { OptionChainPollService } from '../../core/services/option-chain-poll.service';
import { toOptionComponentGauges } from '../../core/models/option-chain.models';
import { patchMultiTfSpotCandles } from '../../core/utils/live-candle-patch';
import { formatSignalCalculatedAt } from '../../core/utils/format-signal-timestamp';

type SignalSubTab = 'priceAction' | 'optionChain';
type ComponentsSubTab = 'priceAction' | 'optionChain';

@Component({
  selector: 'app-live-deck',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    LoaderComponent,
    PaGaugeComponent,
    BipolarListComponent,
    PaDrilldownComponent,
    VetoBreakupComponent,
    DeckChartsComponent,
    PositionsListComponent,
    EventListComponent,
    MarketRegimeComponent,
    VetoStripComponent,
    AutoExitPanelComponent,
    AutoEntryPanelComponent,
    MarketNewsPanelComponent,
    TradeJournalListComponent,
    StrategyPanelComponent,
    SignalReadoutHelpComponent,
    ComponentsHelpComponent,
    PositionSizingComponent,
    OptionChainSignalPanelComponent,
  ],
  template: `
    <section class="deck-page">
      @if (!tick() && !error()) {
        <app-loader message="Fetching data…" sub="Connecting to live stream…" />
      }

      @if (error(); as message) {
        <div class="deck-error" role="alert">
          <p>{{ message }}</p>
          <button type="button" class="deck-retry-btn" (click)="retry()">
            Retry
          </button>
        </div>
      }

      @if (tick(); as data) {
        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'signal'"
        >
          <nav class="signal-subtabs" aria-label="Signal views">
            <button
              type="button"
              class="signal-subtab"
              [class.active]="signalSubTab() === 'priceAction'"
              (click)="signalSubTab.set('priceAction')"
            >
              Price action
            </button>
            <button
              type="button"
              class="signal-subtab"
              [class.active]="signalSubTab() === 'optionChain'"
              (click)="signalSubTab.set('optionChain')"
            >
              Option chain
            </button>
            @if (signalSubTab() === 'optionChain') {
              <span class="signal-subtab-spacer"></span>
              <span class="oc-poll-hint">{{ optionPollLabel() }}</span>
              <button
                type="button"
                class="signal-refresh-btn"
                [disabled]="optionPoll.loading()"
                [attr.aria-label]="
                  optionPoll.loading()
                    ? 'Refreshing option chain'
                    : 'Refresh option chain'
                "
                [title]="optionPoll.loading() ? 'Refreshing…' : 'Refresh now'"
                (click)="optionPoll.refresh(true)"
              >
                <mat-icon [class.spinning]="optionPoll.loading()">refresh</mat-icon>
              </button>
            }
          </nav>

          @if (signalSubTab() === 'priceAction') {
          <app-signal-readout-help />
          @if (data.chartVetoed) {
            <p class="veto-score-notice" role="status">
              Chart veto active — {{ data.vetoReason || 'structure block' }}
            </p>
          }

          <section class="action-card" [class.conflict]="data.chartVetoed">
            <div class="action-main">
              <span class="action-label">{{ data.action }}</span>
              <div class="entry-conviction">
                <span class="entry-conviction-label">Entry</span>
                <span class="entry-conviction-value">
                  <span
                    class="conviction"
                    [class.at-threshold]="
                      data.conviction >= data.entryThreshold
                    "
                    [class.below-threshold]="
                      data.conviction < data.entryThreshold
                    "
                  >
                    {{ data.conviction }}%
                  </span>
                  <span class="conviction-threshold"
                    >/ {{ data.entryThreshold }}%</span
                  >
                </span>
              </div>
            </div>
            <p class="status-line">{{ data.bias || '—' }}</p>
            <p class="signal-calc-stamp" role="status">
              Signal calculated:
              <time [attr.datetime]="data.signalCalculatedAt ?? data.asOf">
                {{
                  formatSignalCalculatedAt(data.signalCalculatedAt ?? data.asOf)
                }}
              </time>
            </p>
            <app-market-regime [regime]="data.marketRegime" />
          </section>

          <app-pa-gauge
            [reading]="data.gauges.priceAction"
            [paPercent]="
              data.gauges.priceAction.percent || data.lanes.priceActionPercent
            "
            [combinedPercent]="data.lanes.combinedPercent"
            [hideCombinedLane]="data.flowMode === 'pa-only'"
            [weightedBaseConviction]="
              data.weightedBaseConviction ?? data.lanes.combinedPercent
            "
            [entryConviction]="data.conviction"
            [convictionBonuses]="data.convictionBonuses ?? []"
          />
          } @else {
            <app-option-chain-signal-panel />
          }
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'components'"
        >
          <section class="component-panel">
            <app-components-help />
            <nav class="signal-subtabs" aria-label="Component views">
              <button
                type="button"
                class="signal-subtab"
                [class.active]="componentsSubTab() === 'priceAction'"
                (click)="componentsSubTab.set('priceAction')"
              >
                Price action
              </button>
              <button
                type="button"
                class="signal-subtab"
                [class.active]="componentsSubTab() === 'optionChain'"
                (click)="componentsSubTab.set('optionChain')"
              >
                Option chain
              </button>
            </nav>
            @if (componentsSubTab() === 'priceAction') {
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
                  [components]="data.priceActionComponents ?? []"
                  variant="priceAction"
                />
              </div>
              @if (drilldownOpen()) {
                <div class="pa-drilldown">
                  <app-pa-drilldown [drilldown]="data.paDrilldown" />
                </div>
              }
            } @else {
              <div class="panel-head">
                <span>Option chain components</span>
                <button
                  type="button"
                  class="signal-refresh-btn panel-refresh-btn"
                  [disabled]="optionPoll.loading()"
                  [attr.aria-label]="
                    optionPoll.loading()
                      ? 'Refreshing option chain'
                      : 'Refresh option chain'
                  "
                  [title]="optionPoll.loading() ? 'Refreshing…' : 'Refresh now'"
                  (click)="optionPoll.refresh(true)"
                >
                  <mat-icon [class.spinning]="optionPoll.loading()">refresh</mat-icon>
                </button>
              </div>
              @if (optionPoll.data(); as oc) {
                <p class="signal-calc-stamp" role="status">
                  Last updated:
                  <time [attr.datetime]="oc.fetchedAt">
                    {{ formatSignalCalculatedAt(oc.fetchedAt) }}
                  </time>
                </p>
              }
              <p class="component-scale-hint">
                Bipolar scale: <strong>−1</strong> bearish ·
                <strong>0</strong> flat · <strong>+1</strong> bullish.
              </p>
              <div class="component-list">
                <app-bipolar-list
                  [components]="optionComponents()"
                  variant="option"
                />
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
            <p class="settings-hint">
              Veto mode lives in <strong>Settings</strong> — this view shows the
              live breakup.
            </p>
            <section class="veto-breakup-block">
              <div class="panel-head">
                <span>Veto breakup</span>
                <span class="panel-note">{{ vetoSummary(data) }}</span>
              </div>
              @if (data.vetoReason) {
                <p class="veto-breakup-note" role="status">
                  {{ data.vetoReason }}
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
          <app-strategy-panel [strategy]="data.strategyRecommendation" />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'sizing'"
        >
          <app-position-sizing
            [symbol]="data.symbol"
            [lotSize]="data.lotSize"
            [paAction]="data.action"
            [tradingStyle]="ctx.style()"
          />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'charts'"
        >
          <app-deck-charts
            [tabActive]="ctx.activeTab() === 'charts'"
            [spotCandles]="data.spotCandles ?? []"
            [spotCandles5m]="data.spotCandles5m ?? []"
            [spotCandles15m]="data.spotCandles15m ?? []"
            [spotCandles1h]="data.spotCandles1h ?? []"
            [spotSeries]="data.spotSeries"
            [patternInsights]="data.patternInsights"
            [chartPatternNeckline]="data.chartPatternNeckline"
            [chartOverlays]="chartOverlays(data)"
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
          <app-event-list [events]="(data.events ?? []).slice(-20).reverse()" />
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
          <app-auto-entry-panel
            [guardStatus]="data.managementContext?.autoEntry?.status"
            [guardMessage]="data.managementContext?.autoEntry?.message"
            [confirmationCount]="data.managementContext?.autoEntry?.confirmationCount"
            [confirmationsRequired]="
              data.managementContext?.autoEntry?.confirmationsRequired
            "
            [pendingAction]="data.managementContext?.autoEntry?.pendingAction"
          />
          <app-auto-exit-panel
            [guardStatus]="data.managementContext?.autoExit?.status"
            [guardMessage]="data.managementContext?.autoExit?.message"
          />
          <app-positions-list
            [entries]="data.openPositions?.entries ?? []"
            [note]="data.openPositions?.note"
            [advice]="data.managementContext?.advice?.headline"
          />
        </section>

        <section
          class="tab-panel"
          [class.active]="ctx.activeTab() === 'settings'"
        >
          <section class="settings-panel">
            <div class="settings-groups">
              <div class="settings-group">
                <div class="settings-group-head">
                  <p class="settings-group-title">Symbol</p>
                </div>
                <div class="settings-control">
                  <select
                    class="settings-select"
                    [ngModel]="ctx.symbol()"
                    (ngModelChange)="onSymbolChange($event)"
                  >
                    @for (s of ctx.symbols; track s) {
                      <option [value]="s">{{ ctx.shortLabel(s) }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="settings-group">
                <div class="settings-group-head">
                  <p class="settings-group-title">Style</p>
                </div>
                <div class="settings-control">
                  <select
                    class="settings-select"
                    [ngModel]="ctx.style()"
                    (ngModelChange)="onStyleChange($event)"
                  >
                    <option value="INTRADAY">Intraday</option>
                    <option value="SCALPER">Scalper</option>
                    <option value="POSITIONAL">Positional</option>
                  </select>
                </div>
              </div>
              @if (settings(); as s) {
                @for (group of s.groups; track group.id) {
                  <div class="settings-group">
                    <div class="settings-group-head">
                      <p class="settings-group-title">{{ group.title }}</p>
                      @if (group.options?.[0]?.hint) {
                        <p class="settings-group-desc">
                          {{ group.options![0].hint }}
                        </p>
                      }
                    </div>
                    @if (group.options) {
                      <div class="settings-control">
                        @for (opt of group.options; track opt.value) {
                          <button
                            type="button"
                            class="settings-segment"
                            [class.active]="
                              settingValue(s, group.field) === opt.value
                            "
                            (click)="patchSetting(group.field, opt.value)"
                          >
                            {{ opt.label }}
                          </button>
                        }
                      </div>
                    }
                  </div>
                }
              }
            </div>
          </section>
        </section>
      }
    </section>
  `,
  styles: [
    `
      :host ::ng-deep .mat-mdc-progress-spinner {
        --mdc-circular-progress-active-indicator-color: var(--option);
      }
      .deck-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 32px 20px;
        text-align: center;
        color: var(--muted);
      }
      .deck-retry-btn {
        border: 1px solid rgba(34, 211, 238, 0.35);
        background: rgba(34, 211, 238, 0.1);
        color: var(--option);
        border-radius: 999px;
        padding: 8px 16px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
      }
      .signal-subtabs {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
      }
      .signal-subtab-spacer {
        flex: 1;
      }
      .oc-poll-hint {
        font-size: 0.68rem;
        color: var(--muted);
        white-space: nowrap;
      }
      .signal-refresh-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 1px solid rgba(167, 139, 250, 0.4);
        background: rgba(167, 139, 250, 0.12);
        color: #c4b5fd;
        border-radius: 8px;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
      }
      .signal-refresh-btn mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .signal-refresh-btn:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .signal-refresh-btn mat-icon.spinning {
        animation: signal-refresh-spin 0.8s linear infinite;
      }
      @keyframes signal-refresh-spin {
        to {
          transform: rotate(360deg);
        }
      }
      .panel-refresh-btn {
        text-transform: none;
        letter-spacing: 0;
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
    `,
  ],
})
export class LiveDeckComponent implements OnInit, OnDestroy {
  readonly ctx = inject(DeckContextService);
  readonly optionPoll = inject(OptionChainPollService);
  private readonly deckApi = inject(DeckApiService);
  private readonly stream = inject(DeckStreamService);
  private readonly notify = inject(NotificationService);
  private readonly deckAlerts = inject(DeckAlertService);
  private sub: Subscription | null = null;
  private pendingChartPatch: Partial<DeckLiveTick> | null = null;

  readonly tick = signal<DeckLiveTick | null>(null);
  readonly settings = signal<SettingsSnapshot | null>(null);
  readonly error = signal<string | null>(null);
  readonly drilldownOpen = signal(true);
  readonly signalSubTab = signal<SignalSubTab>('priceAction');
  readonly componentsSubTab = signal<ComponentsSubTab>('priceAction');
  protected readonly formatSignalCalculatedAt = formatSignalCalculatedAt;

  readonly optionComponents = computed(() => {
    const rows = this.optionPoll.data()?.componentRows ?? [];
    return toOptionComponentGauges(rows);
  });

  constructor() {
    effect(() => {
      const symbol = this.ctx.symbol();
      const style = this.ctx.style();
      this.reload(symbol, style);
    });

    effect(() => {
      const tab = this.ctx.activeTab();
      const signalTab = this.signalSubTab();
      const compTab = this.componentsSubTab();
      const symbol = this.ctx.symbol();
      const style = this.ctx.style();
      const pollMs = this.settings()?.optionChainPollMs ?? 300_000;
      const paAction = this.tick()?.action;
      const needsOption =
        tab === 'signal' && signalTab === 'optionChain'
          ? true
          : tab === 'components' && compTab === 'optionChain';

      if (needsOption) {
        this.optionPoll.configure({
          symbol,
          style,
          pollMs,
          paAction,
          enabled: true,
        });
      } else {
        this.optionPoll.stop();
      }
    });
  }

  ngOnInit(): void {
    this.deckApi.getSettings().subscribe({
      next: (s) => this.settings.set(s),
      error: (err) =>
        this.notify.error(err?.message || 'Failed to load settings'),
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.optionPoll.stop();
  }

  optionPollLabel(): string {
    const ms = this.settings()?.optionChainPollMs ?? 300_000;
    if (ms <= 0) return 'Manual refresh';
    if (ms < 60_000) return `Auto: ${Math.round(ms / 1000)}s`;
    return `Auto: ${Math.round(ms / 60_000)} min`;
  }

  retry(): void {
    this.error.set(null);
    this.reload(this.ctx.symbol(), this.ctx.style());
  }

  onSymbolChange(symbol: string): void {
    this.ctx.setSymbol(symbol);
  }

  onStyleChange(style: TradingStyle): void {
    this.ctx.setStyle(style);
    this.deckApi.patchSettings({ tradingStyle: style }).subscribe({
      next: (s) => {
        this.settings.set(s);
        this.syncStyleFromSettings(s);
      },
      error: (err) =>
        this.notify.error(err?.error?.error || err.message || 'Update failed'),
    });
  }

  patchSetting(field: string, value: string): void {
    this.deckApi.patchSettings({ [field]: value }).subscribe({
      next: (s) => {
        this.settings.set(s);
        this.syncStyleFromSettings(s);
        this.notify.success('Settings updated');
      },
      error: (err) =>
        this.notify.error(err?.error?.error || err.message || 'Update failed'),
    });
  }

  settingValue(s: SettingsSnapshot, field: string): string {
    if (field === 'tradingStyle') return s.tradingStyle;
    if (field === 'vetoMode') return s.vetoMode;
    if (field === 'optionChainPollMs') {
      return String(s.optionChainPollMs ?? 300_000);
    }
    if (field === 'flowMode') return s.flowMode;
    return '';
  }

  hasVetoBlock(data: DeckLiveTick): boolean {
    return (data.vetoBreakup ?? []).some((item) => item.state === 'block');
  }

  vetoSummary(data: DeckLiveTick): string {
    const items = data.vetoBreakup ?? [];
    const blocks = items.filter((i) => i.state === 'block').length;
    const warns = items.filter((i) => i.state === 'warn').length;
    if (blocks) return `${blocks} block${blocks > 1 ? 's' : ''}`;
    if (warns) return `${warns} warn${warns > 1 ? 's' : ''}`;
    return 'All clear';
  }

  chartOverlays(data: DeckLiveTick): ChartOverlayLine[] {
    const section = data.paDrilldown?.sections?.find((s) => s.id === 'levels');
    const pattern = data.patternInsights?.find((p) => p.label === 'Chart Pattern');
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
    if (Number.isFinite(data.chartPatternNeckline)) {
      overlays.push({
        id: 'pattern',
        label: pattern?.pattern ? `${this.displayPatternName(pattern.pattern)} neckline` : 'Neckline',
        price: data.chartPatternNeckline!,
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

  private syncStyleFromSettings(s: SettingsSnapshot): void {
    if (!s.tradingStyle) return;
    this.ctx.setStyle(s.tradingStyle as TradingStyle);
  }

  private reload(symbol: string, style: string): void {
    this.sub?.unsubscribe();
    this.error.set(null);
    this.pendingChartPatch = null;
    this.tick.set(null);
    this.deckAlerts.reset();

    const tradingStyle = style as TradingStyle;
    this.sub = new Subscription();

    this.sub.add(
      this.deckApi.getLive(symbol, tradingStyle, 'fast').subscribe({
        next: (fast) => this.applyTick(fast),
        error: (err) => {
          const message =
            err?.error?.error || err.message || 'Live deck failed';
          this.error.set(message);
          this.notify.error(message);
        },
      }),
    );

    this.sub.add(
      this.deckApi.getLive(symbol, tradingStyle, 'enrichment').subscribe({
        next: (enrichment) => this.mergeChartPatch(enrichment),
        error: () => {
          /* chart data is optional — fast tick + stream still drive the deck */
        },
      }),
    );

    this.sub.add(
      this.stream.connect(symbol, style).subscribe({
        next: (event) => {
          if ('type' in event && event.type === 'status') {
        const isConnected = event.phase === 'connected';
        this.ctx.updateTracker({
          connected: isConnected,
          live: isConnected,
        });
        return;
      }
          if (
            'type' in event &&
            (event.type === 'enrichment' ||
              event.type === 'positions' ||
              event.type === 'ltp')
          ) {
            const patch = event as unknown as Partial<DeckLiveTick> & {
              type: string;
            };
            const { type: _type, ...rest } = patch;
            this.mergeChartPatch(rest);
            return;
          }
          if ('action' in event) {
            this.applyTick({
              ...(this.tick() ?? {}),
              ...event,
            } as DeckLiveTick);
          }
        },
        error: (err: Error) => {
          this.ctx.updateTracker({ connected: false, live: false });
          if (!this.tick()) {
            const message = err.message || 'Stream failed';
            this.error.set(message);
            this.notify.error(message);
          }
        },
      }),
    );
  }

  /** Enrichment lacks gauges/action — never use it as the initial tick. */
  private mergeChartPatch(patch: Partial<DeckLiveTick>): void {
    this.pendingChartPatch = this.withLiveChartCandles({
      ...(this.pendingChartPatch ?? {}),
      ...patch,
    });
    this.tick.update((prev) => {
      if (!prev) return prev;
      const next = this.withLiveChartCandles({
        ...prev,
        ...patch,
      }) as DeckLiveTick;
      this.deckAlerts.evaluate(prev, next);
      return next;
    });
    if (patch.lastPrice != null && Number.isFinite(patch.lastPrice)) {
      this.ctx.updateTracker({
        price: patch.lastPrice,
        dayChange: patch.dayChange ?? null,
        dayChangePct: patch.dayChangePct ?? null,
        connected: true,
        live: true,
        asOf: patch.asOf,
      });
    }
  }

  private applyTick(data: DeckLiveTick): void {
    const prev = this.tick();
    const next = this.withLiveChartCandles({
      ...(prev ?? {}),
      ...(this.pendingChartPatch ?? {}),
      ...data,
      signalCalculatedAt:
        data.signalCalculatedAt ?? data.asOf ?? prev?.signalCalculatedAt,
    }) as DeckLiveTick;
    this.tick.set(next);
    if (prev) {
      this.deckAlerts.evaluate(prev, next);
    } else {
      this.deckAlerts.setBaseline(next);
    }
    this.ctx.updateTracker({
      symbol: next.symbol,
      symbolLabel: next.symbolLabel,
      price: next.lastPrice,
      dayChange: next.dayChange ?? null,
      dayChangePct: next.dayChangePct ?? null,
      style: next.tradingStyle ?? this.ctx.style(),
      connected: true,
      live: true,
      asOf: next.asOf,
    });
  }

  private withLiveChartCandles<T extends Partial<DeckLiveTick>>(tick: T): T {
    if (!Number.isFinite(tick.lastPrice) || (tick.lastPrice ?? 0) <= 0) {
      return tick;
    }
    const candlePatch = patchMultiTfSpotCandles(tick, tick.lastPrice!);
    if (!Object.keys(candlePatch).length) return tick;
    return { ...tick, ...candlePatch };
  }
}
