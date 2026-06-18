import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  effect,
  signal,
} from '@angular/core';
import { ChartOverlayLine, DeckLiveTick } from '../../core/models/deck.models';
import { SpotChartComponent } from '../spot-chart/spot-chart.component';

type Candle = { t: number; o: number; h: number; l: number; c: number };
type ChartTf = '5m' | '15m' | '1h';

interface ChartLayerDef {
  id: string;
  label: string;
  color: string;
  swatch: string;
}

const CHART_LAYER_DEFS: ChartLayerDef[] = [
  { id: 'ema9', label: '9 EMA', color: '#ef4444', swatch: 'line' },
  { id: 'ema21', label: '21 EMA', color: '#eab308', swatch: 'line' },
  { id: 'support', label: 'Support', color: '#22d3ee', swatch: 'hline' },
  { id: 'resistance', label: 'Resistance', color: '#f472b6', swatch: 'hline' },
  { id: 'supportTrend', label: 'S trend', color: '#4ade80', swatch: 'dline' },
  { id: 'resistanceTrend', label: 'R trend', color: '#fb923c', swatch: 'dline' },
  { id: 'pattern', label: 'Pattern', color: '#a78bfa', swatch: 'pattern' },
];

@Component({
  selector: 'app-deck-charts',
  standalone: true,
  imports: [SpotChartComponent],
  template: `
    <section class="chart-block chart-block-padded">
      <div class="chart-title-row">
        <div class="chart-title">
          Charts <span class="spot-session-label">09:15–15:30 IST</span>
        </div>
        @if (patternContext()) {
          <span class="pattern-context">{{ patternContext() }}</span>
        }
      </div>

      <div class="chart-layer-toggles" role="group" aria-label="Chart overlays">
        @for (layer of layers; track layer.id) {
          <button
            type="button"
            class="chart-layer-btn"
            [class.active]="isLayerOn(layer.id)"
            [class.off]="!isLayerOn(layer.id)"
            [class.unavailable]="!isLayerAvailable(layer.id)"
            [disabled]="!isLayerAvailable(layer.id)"
            [attr.aria-pressed]="isLayerOn(layer.id)"
            (click)="toggleLayer(layer.id)"
          >
            <span
              class="chart-layer-swatch"
              [class]="layer.swatch"
              [style.--layer-color]="layer.color"
            ></span>
            <span class="chart-layer-label" [style.color]="isLayerOn(layer.id) ? layer.color : null">
              {{ layer.label }}
            </span>
          </button>
        }
      </div>

      <div class="chart-tf-tabs" role="tablist" aria-label="Chart timeframe">
        @for (tf of timeframes; track tf) {
          <button
            type="button"
            class="chart-tf-btn"
            [class.active]="activeTf() === tf"
            role="tab"
            [attr.aria-selected]="activeTf() === tf"
            (click)="activeTf.set(tf)"
          >
            {{ tf }}
          </button>
        }
      </div>

      <div class="multi-chart-grid single-tf-view">
        <div class="chart-container active" [attr.data-chart-tf]="activeTf()">
          <div class="chart-label">{{ tfLabel(activeTf()) }}</div>
          <div class="chart-tf-panel">
            @if (!hasChartData()) {
              <p class="chart-empty" role="status">
                {{ tabActive ? 'Loading chart data…' : 'Open the Chart tab to load candles.' }}
              </p>
            }
            @if (tabActive && hasChartData()) {
              <app-spot-chart
                #spotChart
                [candles]="candlesFor(activeTf())"
                [spotSeries]="seriesFor(activeTf())"
                [scrubTime]="scrubTime"
                [overlays]="activeOverlays()"
                [layers]="layerState()"
                [timeframe]="activeTf()"
              />
            }
          </div>
        </div>
      </div>

      <div class="pattern-insights-block">
        <div class="pattern-insights-head">
          <span class="pattern-insights-title">Pattern insights</span>
          <span class="pattern-insights-sub muted">
            {{ patternInsights?.length ? 'Live chart & candlestick reads' : 'No active patterns on this symbol' }}
          </span>
        </div>
        @if (patternInsights?.length) {
          <div class="pattern-insights-list">
          @for (insight of patternInsights!; track insight.timeframe + insight.pattern) {
            <div class="pattern-insight-card">
              <div class="pattern-insight-left">
                <span class="pattern-insight-tf">{{ insight.timeframe }}</span>
                <span class="pattern-insight-name">{{ insight.pattern }}</span>
                <span class="pattern-insight-type">{{ insight.biasLabel || insight.label }}</span>
              </div>
              <div class="pattern-insight-right">
                @if (insight.status) {
                  <span class="pattern-insight-status" [class]="insight.status">
                    {{ insight.status }}
                  </span>
                }
                <div class="pattern-insight-tone" [class]="insight.tone"></div>
              </div>
            </div>
          }
          </div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .chart-block-padded {
        padding: 12px 14px 16px;
      }
      .pattern-insights-head {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 10px;
      }
      .pattern-insights-title {
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .pattern-insights-sub {
        font-size: 0.72rem;
      }
      .chart-tf-panel {
        position: relative;
        min-height: 280px;
      }
      .chart-empty {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 12px;
        text-align: center;
        font-size: 0.72rem;
        color: var(--muted);
        border-radius: 10px;
        border: 1px dashed var(--border);
        background: rgba(22, 26, 32, 0.92);
      }
    `,
  ],
})
export class DeckChartsComponent implements AfterViewInit, OnChanges {
  @ViewChild('spotChart') spotChart?: SpotChartComponent;

  readonly layers = CHART_LAYER_DEFS;
  readonly timeframes: ChartTf[] = ['5m', '15m', '1h'];
  readonly activeTf = signal<ChartTf>('15m');
  readonly layerState = signal<Record<string, boolean>>(
    Object.fromEntries(CHART_LAYER_DEFS.map((layer) => [layer.id, true])),
  );

  @Input() spotCandles5m: Candle[] = [];
  @Input() spotCandles15m: Candle[] = [];
  @Input() spotCandles1h: Candle[] = [];
  @Input() spotCandles: Candle[] = [];
  @Input() spotSeries: Array<{ t: number; v: number }> = [];
  @Input() patternInsights: DeckLiveTick['patternInsights'];
  @Input() chartOverlays: ChartOverlayLine[] = [];
  @Input() chartPatternNeckline?: number;
  @Input() scrubTime: number | null = null;
  @Input() tabActive = true;

  constructor() {
    effect(() => {
      this.activeTf();
      if (this.tabActive && this.hasChartData()) {
        this.scheduleChartMount();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tabActive']?.currentValue === true) {
      this.scheduleChartMount();
    }
    if (changes['spotCandles'] || changes['spotCandles5m'] || changes['spotCandles15m'] || changes['spotCandles1h'] || changes['spotSeries']) {
      if (this.tabActive && this.hasChartData()) this.scheduleChartMount();
    }
  }

  ngAfterViewInit(): void {
    if (this.tabActive && this.hasChartData()) this.scheduleChartMount();
  }

  hasChartData(): boolean {
    return (
      this.spotCandles5m.length > 0 ||
      this.spotCandles15m.length > 0 ||
      this.spotCandles1h.length > 0 ||
      this.spotCandles.length > 0 ||
      this.spotSeries.length > 0
    );
  }

  /** Mirrors Opstra: remount only after the charts tab panel is visible and sized. */
  private scheduleChartMount(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.spotChart?.refresh();
        window.setTimeout(() => this.spotChart?.refresh(), 120);
      });
    });
  }

  tfLabel(tf: ChartTf): string {
    if (tf === '5m') return '5 min';
    if (tf === '1h') return '1 hour';
    return '15 min';
  }

  candlesFor(tf: ChartTf): Candle[] {
    if (tf === '5m') return this.spotCandles5m.length ? this.spotCandles5m : this.spotCandles;
    if (tf === '1h') return this.spotCandles1h.length ? this.spotCandles1h : this.spotCandles;
    return this.spotCandles15m.length ? this.spotCandles15m : this.spotCandles;
  }

  seriesFor(tf: ChartTf): Array<{ t: number; v: number }> {
    return this.candlesFor(tf).length ? [] : this.spotSeries;
  }

  patternContext(): string | null {
    const active = this.patternInsights?.find((p) => p.timeframe === this.activeTf());
    return active ? `${active.pattern} · ${active.label}` : null;
  }

  isLayerAvailable(id: string): boolean {
    const candleCount = this.candlesFor(this.activeTf()).length;
    if (id === 'ema9' || id === 'ema21') return candleCount >= 1;
    if (id === 'supportTrend' || id === 'resistanceTrend') return candleCount >= 8;
    if (id === 'support') return this.chartOverlays.some((o) => o.id === 'support');
    if (id === 'resistance') return this.chartOverlays.some((o) => o.id === 'resistance');
    if (id === 'pattern') {
      return Boolean(this.patternInsights?.length) || Number.isFinite(this.chartPatternNeckline);
    }
    return false;
  }

  isLayerOn(id: string): boolean {
    return this.layerState()[id] ?? false;
  }

  toggleLayer(id: string): void {
    if (!this.isLayerAvailable(id)) return;
    this.layerState.update((state) => ({ ...state, [id]: !state[id] }));
  }

  activeOverlays(): ChartOverlayLine[] {
    const state = this.layerState();
    const overlays = this.chartOverlays.filter((overlay) => state[overlay.id]);
    if (
      state['pattern'] &&
      Number.isFinite(this.chartPatternNeckline) &&
      !overlays.some((o) => o.id === 'pattern')
    ) {
      overlays.push({
        id: 'pattern',
        label: 'Neckline',
        price: this.chartPatternNeckline!,
        color: '#a78bfa',
        kind: 'hline',
      });
    }
    return overlays;
  }
}