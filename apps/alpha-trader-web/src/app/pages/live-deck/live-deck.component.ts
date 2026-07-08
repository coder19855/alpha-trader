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
import {
  DeckStreamPhase,
  DeckStreamService,
} from '../../core/services/deck-stream.service';
import { DeckStreamStatus } from '../../core/services/deck-context.service';
import { DeckAlertService } from '../../core/services/deck-alert.service';
import { NotificationService } from '../../core/services/notification.service';
import { BipolarListComponent } from '../../shared/bipolar-list/bipolar-list.component';
import { DeckChartsComponent } from '../../shared/deck-charts/deck-charts.component';
import { PaDrilldownComponent } from '../../shared/pa-drilldown/pa-drilldown.component';
import { PaGaugeComponent } from '../../shared/pa-gauge/pa-gauge.component';
import { PaSignalInsightsComponent } from '../../shared/pa-signal-insights/pa-signal-insights.component';
import { PaTradeSetupComponent } from '../../shared/pa-trade-setup/pa-trade-setup.component';
import { PaComponentSignalsComponent } from '../../shared/pa-component-signals/pa-component-signals.component';
import { PaSignalBriefComponent } from '../../shared/pa-signal-brief/pa-signal-brief.component';
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
import { DeckReloadService } from '../../core/services/deck-reload.service';
import { toOptionComponentGauges } from '../../core/models/option-chain.models';
import { patchMultiTfSpotCandles } from '../../core/utils/live-candle-patch';
import { formatSignalCalculatedAt } from '../../core/utils/format-signal-timestamp';
import { SignalDualLaneComponent } from '../../shared/signal-dual-lane/signal-dual-lane.component';

type SignalSubTab = 'priceAction' | 'optionChain';
type PaSignalSubTab = 'brief' | 'overview' | 'timeframes' | 'context';
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
    PaSignalInsightsComponent,
    PaTradeSetupComponent,
    PaComponentSignalsComponent,
    PaSignalBriefComponent,
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
    SignalDualLaneComponent,
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
          <app-signal-dual-lane
            [paAction]="data.action"
            [paConviction]="data.conviction"
            [paBias]="data.bias ?? ''"
            [optionSignal]="optionPoll.data()?.signal ?? null"
            [optionConviction]="optionPoll.data()?.conviction ?? null"
            [optionBias]="optionPoll.data()?.bias ?? ''"
            [paAlignment]="optionPoll.data()?.paAlignment ?? null"
            [paAlignmentDetail]="optionPoll.data()?.paAlignmentDetail ?? ''"
            [optionLoading]="optionPoll.loading() && !optionPoll.data()"
            [optionLive]="!!optionPoll.data()"
            [flowMode]="data.flowMode ?? 'pa-only'"
          />
...TRUNCATED...
  private forceReload(): void {
    // Hard reset option-chain stream first to avoid duplicate listeners/timers.
    this.optionPoll.hardReconnect(true);
    // Then hard reload live deck HTTP + SSE stream.
    this.reload(this.ctx.symbol(), this.ctx.style());
  }
...TRUNCATED...
}
