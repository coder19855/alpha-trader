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
import {
  SpotChartComponent,
  SpotChartStyle,
} from '../spot-chart/spot-chart.component';

const CHART_STYLE_STORAGE_KEY = 'alpha-trader.deck-chart-style';

type Candle = { t: number; o: number; h: number; l: number; c: number };
type ChartTf = '5m' | '15m' | '1h';

interface ChartLayerDef {
  id: string;
  label: string;
  color: string;
  swatch: string;
}

interface ChartLayerGroupDef {
  id: string;
  label: string;
  color: string;
  swatch: string;
  childIds: string[];
  detail: string;
}

const CHART_LAYER_GROUPS: ChartLayerGroupDef[] = [
  {
    id: 'indicators',
    label: 'Indicators',
    color: '#ef4444',
    swatch: 'line',
    childIds: ['ema9', 'ema21'],
    detail: 'EMA 9 / EMA 21',
  },
  {
    id: 'priceAction',
    label: 'Price action',
    color: '#22d3ee',
    swatch: 'hline',
    childIds: ['support', 'resistance'],
    detail: 'Support / Resistance',
  },
  {
    id: 'trendLines',
    label: 'Trend lines',
    color: '#4ade80',
    swatch: 'dline',
    childIds: ['supportTrend', 'resistanceTrend'],
    detail: 'Support trend / Resistance trend',
  },
  {
    id: 'chartPattern',
    label: 'Chart patterns',
    color: '#a78bfa',
    swatch: 'pattern',
    childIds: ['chartPattern'],
    detail: 'Up to 2 valid patterns',
  },
  {
    id: 'candlestick',
    label: 'Candlestick',
    color: '#fbbf24',
    swatch: 'candle',
    childIds: ['candlestick'],
    detail: 'TF candlestick signal',
  },
];

const CHART_LAYER_DEFS: ChartLayerDef[] = CHART_LAYER_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  color: group.color,
  swatch: group.swatch,
}));

@Component({
  selector: 'app-deck-charts',
  standalone: true,
  imports: [SpotChartComponent],
  template: `
    <section class="chart-block chart-block-padded">
      <div class="chart-title-row">
        <div class="chart-title">
          Charts
          <span class="spot-session-label">Scroll ← for history · IST sessions</span>
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
            [class.active]="isGroupOn(layer.id)"
            [class.off]="!isGroupOn(layer.id)"
            [class.unavailable]="!isGroupAvailable(layer.id)"
            [disabled]="!isGroupAvailable(layer.id)"
            [attr.aria-pressed]="isGroupOn(layer.id)"
            (click)="toggleGroup(layer.id)"
          >
            <span
              class="chart-layer-swatch"
              [class]="layer.swatch"
              [style.--layer-color]="layer.color"
            ></span>
            <span class="chart-layer-label" [style.color]="isGroupOn(layer.id) ? layer.color : null">
              {{ layer.label }}
            </span>
            <span class="chart-layer-detail">{{ groupDetail(layer.id) }}</span>
          </button>
        }
      </div>

      <div class="chart-toolbar-row">
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
        <div class="chart-style-toggle" role="group" aria-label="Chart style">
          <button
            type="button"
            class="chart-style-btn"
            [class.active]="chartStyle() === 'candlestick'"
            [attr.aria-pressed]="chartStyle() === 'candlestick'"
            (click)="setChartStyle('candlestick')"
          >
            Candles
          </button>
          <button
            type="button"
            class="chart-style-btn"
            [class.active]="chartStyle() === 'line'"
            [attr.aria-pressed]="chartStyle() === 'line'"
            (click)="setChartStyle('line')"
          >
            Line
          </button>
        </div>
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
                [chartPatternNeckline]="chartPatternNeckline"
                [patternInsights]="patternInsights ?? []"
                [layers]="layerState()"
                [timeframe]="activeTf()"
                [chartStyle]="chartStyle()"
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
      .chart-toolbar-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin: 10px 0 8px;
        padding: 0 4px;
      }
      .chart-toolbar-row .chart-tf-tabs {
        margin: 0;
        flex: 1 1 220px;
      }
      .chart-style-toggle {
        display: inline-flex;
        gap: 4px;
        padding: 3px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.02);
      }
      .chart-style-btn {
        padding: 6px 10px;
        border-radius: 6px;
        border: 0;
        background: transparent;
        color: var(--muted);
        font-size: 0.68rem;
        font-weight: 600;
        letter-spacing: 0.03em;
        cursor: pointer;
      }
      .chart-style-btn.active {
        color: var(--text);
        background: rgba(34, 211, 238, 0.1);
      }
      .chart-layer-detail {
        font-size: 0.65rem;
        color: var(--muted);
        white-space: nowrap;
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
  readonly chartStyle = signal<SpotChartStyle>(this.readStoredChartStyle());
  readonly layerState = signal<Record<string, boolean>>(
    Object.fromEntries(
      CHART_LAYER_GROUPS.flatMap((group) =>
        group.childIds.map((id) => [id, false] as const),
      ),
    ),
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

  setChartStyle(style: SpotChartStyle): void {
    this.chartStyle.set(style);
    try {
      localStorage.setItem(CHART_STYLE_STORAGE_KEY, style);
    } catch {
      /* ignore quota / private mode */
    }
    this.scheduleChartMount();
  }

  private readStoredChartStyle(): SpotChartStyle {
    try {
      const stored = localStorage.getItem(CHART_STYLE_STORAGE_KEY);
      return stored === 'line' ? 'line' : 'candlestick';
    } catch {
      return 'candlestick';
    }
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
    if (id === 'chartPattern') {
      return (
        Boolean(
          this.patternInsights?.some(
            (row) =>
              (row.type === 'chart' || row.label === 'Chart Pattern') &&
              row.pattern &&
              !/^none$/i.test(row.pattern),
          ),
        ) || Number.isFinite(this.chartPatternNeckline)
      );
    }
    if (id === 'candlestick') {
      return Boolean(
        this.patternInsights?.some(
          (row) =>
            (row.type === 'candlestick' || row.label === 'Candlestick') &&
            row.timeframe === this.activeTf() &&
            row.pattern &&
            !/^none$/i.test(row.pattern),
        ),
      );
    }
    return false;
  }

  isLayerOn(id: string): boolean {
    return this.isGroupOn(id);
  }

  isGroupAvailable(id: string): boolean {
    const group = CHART_LAYER_GROUPS.find((item) => item.id === id);
    return group ? group.childIds.some((childId) => this.isChildAvailable(childId)) : false;
  }

  isGroupOn(id: string): boolean {
    const group = CHART_LAYER_GROUPS.find((item) => item.id === id);
    return group ? group.childIds.some((childId) => this.layerState()[childId] === true) : false;
  }

  toggleGroup(id: string): void {
    const group = CHART_LAYER_GROUPS.find((item) => item.id === id);
    if (!group || !this.isGroupAvailable(id)) return;
    const next = !this.isGroupOn(id);
    this.layerState.update((state) => {
      const updated = { ...state };
      for (const childId of group.childIds) {
        if (this.isChildAvailable(childId)) {
          updated[childId] = next;
        }
      }
      return updated;
    });
  }

  activeOverlays(): ChartOverlayLine[] {
    const state = this.layerState();
    const overlays = this.chartOverlays.filter((overlay) => state[overlay.id]);
    if (
      state['chartPattern'] &&
      Number.isFinite(this.chartPatternNeckline) &&
      !overlays.some((o) => o.id === 'chartPattern')
    ) {
      overlays.push({
        id: 'chartPattern',
        label: 'Neckline',
        price: this.chartPatternNeckline!,
        color: '#a78bfa',
        kind: 'hline',
      });
    }
    return overlays;
  }

  groupDetail(id: string): string {
    const group = CHART_LAYER_GROUPS.find((item) => item.id === id);
    return group?.detail ?? '';
  }

  private isChildAvailable(id: string): boolean {
    return this.isLayerAvailable(id);
  }
}