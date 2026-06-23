import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  CandlestickData,
  CandlestickSeries,
  ColorType,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineData,
  LineSeries,
  LogicalRange,
  Time,
  createChart,
} from 'lightweight-charts';
import { ChartOverlayLine } from '../../core/models/deck.models';
import {
  PatternDrawOp,
  PatternInsight,
  buildCandlestickHighlightOps,
  buildCandlestickMarkerOp,
  buildChartPatternOps,
  candlestickInsightForTf,
  collectPatternTimeBounds,
  resolveCandlestickCandles,
  selectChartPatternsToPlot,
} from './spot-chart-pattern-geometry';

type Candle = { t: number; o: number; h: number; l: number; c: number };
type SpotPoint = { t: number; v: number };
export type SpotChartStyle = 'candlestick' | 'line';

interface IstChartSession {
  fromMs: number;
  toMs: number;
  closeMs: number;
}

@Component({
  selector: 'app-spot-chart',
  standalone: true,
  template: `
    <div class="chart-shell">
      <div #container class="chart-host"></div>
      <svg #overlay class="pattern-overlay" aria-hidden="true"></svg>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-height: 280px;
      }
      .chart-shell {
        position: relative;
        width: 100%;
        height: 280px;
        min-height: 280px;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--border);
        background: var(--chart-bg, var(--surface));
      }
      .chart-host {
        width: 100%;
        height: 100%;
      }
      .pattern-overlay {
        position: absolute;
        inset: 0;
        z-index: 2;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: visible;
      }
    `,
  ],
})
export class SpotChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;
  @ViewChild('overlay', { static: true }) overlay!: ElementRef<SVGSVGElement>;
  @Input() candles: Candle[] = [];
  @Input() spotSeries: SpotPoint[] = [];
  @Input() scrubTime: number | null = null;
  @Input() overlays: ChartOverlayLine[] = [];
  @Input() chartPatternNeckline?: number;
  @Input() patternInsights: PatternInsight[] = [];
  @Input() highlightPattern: { timeframe: string; pattern: string } | null = null;
  @Input() timeframe: '5m' | '15m' | '1h' = '15m';
  @Input() chartStyle: SpotChartStyle = 'candlestick';
  @Input() layers: Record<string, boolean> = {};

  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<'Candlestick'> | null = null;
  private lineSeries: ISeriesApi<'Line'> | null = null;
  private scrubSeries: ISeriesApi<'Line'> | null = null;
  private ema9Series: ISeriesApi<'Line'> | null = null;
  private ema21Series: ISeriesApi<'Line'> | null = null;
  private supportTrendSeries: ISeriesApi<'Line'> | null = null;
  private resistanceTrendSeries: ISeriesApi<'Line'> | null = null;
  private overlayRedrawId: number | null = null;
  private overlayPriceLines: Array<{
    line: IPriceLine;
    series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
  }> = [];
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private initRetryId: number | null = null;
  private followLatestViewport = true;
  private hasFocusedSession = false;
  private suppressViewportFollow = false;
  private lastDataKey = '';
  private lastRenderedCandleCount = -1;
  private lastRenderedLineCount = -1;
  private latestLogicalIndex = -1;

  ngAfterViewInit(): void {
    const el = this.container.nativeElement;
    this.resizeObserver = new ResizeObserver(() => this.ensureReady());
    this.resizeObserver.observe(el);

    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.ensureReady();
          }
        },
        { threshold: 0.05 },
      );
      this.intersectionObserver.observe(el);
    }

    this.scheduleInitRetries();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['timeframe'] && !changes['timeframe'].firstChange) {
      this.hasFocusedSession = false;
      this.followLatestViewport = true;
      this.lastRenderedCandleCount = -1;
      this.lastRenderedLineCount = -1;
      this.applyTimeframeOptions();
    }

    if (changes['chartStyle'] && !changes['chartStyle'].firstChange) {
      this.lastRenderedCandleCount = -1;
      this.lastRenderedLineCount = -1;
    }

    if (
      changes['candles'] ||
      changes['spotSeries'] ||
      changes['scrubTime'] ||
      changes['overlays'] ||
      changes['chartPatternNeckline'] ||
      changes['patternInsights'] ||
      changes['highlightPattern'] ||
      changes['layers'] ||
      changes['chartStyle']
    ) {
      if (!this.chart) {
        this.scheduleInitRetries();
        return;
      }
      this.render();
    }
  }

  ngOnDestroy(): void {
    if (this.initRetryId != null) {
      cancelAnimationFrame(this.initRetryId);
      this.initRetryId = null;
    }
    if (this.overlayRedrawId != null) {
      cancelAnimationFrame(this.overlayRedrawId);
      this.overlayRedrawId = null;
    }
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.destroyChart();
  }

  /** Called when parent tab becomes visible or layout settles. */
  refresh(): void {
    const el = this.container.nativeElement;
    const sized = el.clientWidth >= 2 && el.clientHeight >= 2;
    if (this.chart && !sized) {
      this.destroyChart();
    }
    this.scheduleInitRetries();
    if (this.chart && sized) {
      this.hasFocusedSession = false;
      this.followLatestViewport = true;
      this.render();
    }
  }

  private scheduleInitRetries(attemptsLeft = 48): void {
    if (this.chart || attemptsLeft <= 0) return;
    if (this.initRetryId != null) return;

    const tick = (left: number): void => {
      this.ensureReady();
      if (this.chart || left <= 0) {
        this.initRetryId = null;
        return;
      }
      this.initRetryId = requestAnimationFrame(() => tick(left - 1));
    };
    tick(attemptsLeft);
  }

  private ensureReady(): void {
    const el = this.container.nativeElement;
    if (el.clientWidth < 2 || el.clientHeight < 2) return;
    if (!this.chart) {
      this.initChart();
      return;
    }
    if (this.followLatestViewport && !this.hasFocusedSession) {
      this.render();
    }
  }

  private destroyChart(): void {
    this.chart?.remove();
    this.chart = null;
    this.candleSeries = null;
    this.lineSeries = null;
    this.scrubSeries = null;
    this.ema9Series = null;
    this.ema21Series = null;
    this.supportTrendSeries = null;
    this.resistanceTrendSeries = null;
    this.overlayPriceLines = [];
    this.lastDataKey = '';
    this.lastRenderedCandleCount = -1;
    this.lastRenderedLineCount = -1;
    this.hasFocusedSession = false;
    this.followLatestViewport = true;
    this.latestLogicalIndex = -1;
  }

  private initChart(): void {
    const el = this.container.nativeElement;
    if (this.chart || el.clientWidth < 2 || el.clientHeight < 2) return;

    const chartBg =
      getComputedStyle(document.documentElement).getPropertyValue('--chart-bg').trim() ||
      '#0a0c10';
    const muted =
      getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() ||
      '#8b95a8';
    const border =
      getComputedStyle(document.documentElement).getPropertyValue('--border').trim() ||
      '#252b36';
    const ce =
      getComputedStyle(document.documentElement).getPropertyValue('--ce').trim() ||
      '#22c55e';
    const pe =
      getComputedStyle(document.documentElement).getPropertyValue('--pe').trim() ||
      '#ef4444';

    this.chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: chartBg },
        textColor: muted,
      },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      rightPriceScale: {
        borderColor: border,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
        rightOffset: this.rightOffsetBars(),
        barSpacing: this.barSpacing(),
        minBarSpacing: 3,
      },
      crosshair: { mode: 0 },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!this.suppressViewportFollow && range && this.latestLogicalIndex >= 0) {
        const margin = this.rightOffsetBars() + 2;
        this.followLatestViewport = range.to >= this.latestLogicalIndex - margin;
      }
      this.scheduleOverlayRedraw();
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: ce,
      downColor: pe,
      borderVisible: false,
      wickUpColor: ce,
      wickDownColor: pe,
    });
    this.lineSeries = this.chart.addSeries(LineSeries, {
      color:
        getComputedStyle(document.documentElement).getPropertyValue('--option').trim() ||
        '#22d3ee',
      lineWidth: 2,
    });
    this.scrubSeries = this.chart.addSeries(LineSeries, {
      color:
        getComputedStyle(document.documentElement).getPropertyValue('--pa').trim() ||
        '#fbbf24',
      lineWidth: 1,
      lineStyle: 2,
    });
    this.ema9Series = this.chart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    this.ema21Series = this.chart.addSeries(LineSeries, {
      color: '#eab308',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    this.supportTrendSeries = this.chart.addSeries(LineSeries, {
      color: '#4ade80',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    this.resistanceTrendSeries = this.chart.addSeries(LineSeries, {
      color: '#fb923c',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    this.render();
  }

  private barSpacing(): number {
    if (this.timeframe === '5m') return 7;
    if (this.timeframe === '1h') return 14;
    return 9;
  }

  private rightOffsetBars(): number {
    if (this.timeframe === '5m') return 8;
    if (this.timeframe === '1h') return 3;
    return 6;
  }

  private applyTimeframeOptions(): void {
    if (!this.chart) return;
    this.chart.timeScale().applyOptions({
      rightOffset: this.rightOffsetBars(),
      barSpacing: this.barSpacing(),
    });
  }

  private render(): void {
    if (!this.chart || !this.candleSeries || !this.lineSeries || !this.scrubSeries) return;

    const candles = this.normalizeCandles(this.candles);
    const spotSeries = this.filterSeriesToSession(this.spotSeries);
    const dataKey = this.buildDataKey(candles, spotSeries);
    const dataChanged = dataKey !== this.lastDataKey;
    this.lastDataKey = dataKey;
    this.latestLogicalIndex = Math.max(candles.length, this.resolveLinePoints(candles, spotSeries).length) - 1;

    const useCandles =
      this.chartStyle === 'candlestick' && candles.length > 0;
    const linePoints = this.resolveLinePoints(candles, spotSeries);
    const activeSeries = useCandles
      ? this.candleSeries
      : linePoints.length
        ? this.lineSeries
        : null;

    const savedLogicalRange =
      dataChanged && !this.followLatestViewport
        ? this.chart.timeScale().getVisibleLogicalRange()
        : null;
    const prevCandleCount = this.lastRenderedCandleCount;
    const prevLineCount = this.lastRenderedLineCount;
    let seriesFullReset = false;

    try {
      if (useCandles) {
        const data: CandlestickData[] = candles.map((c) => ({
          time: Math.floor(c.t / 1000) as Time,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        }));
        if (dataChanged) {
          seriesFullReset = this.applyCandleSeriesData(
            data,
            candles.length,
            prevCandleCount,
          );
        }
        if (this.lastRenderedLineCount !== 0) {
          this.lineSeries.setData([]);
          this.lastRenderedLineCount = 0;
        }
      } else if (linePoints.length) {
        const data: LineData[] = linePoints.map((p) => ({
          time: Math.floor(p.t / 1000) as Time,
          value: p.v,
        }));
        if (dataChanged) {
          seriesFullReset = this.applyLineSeriesData(
            data,
            linePoints.length,
            prevLineCount,
          );
        }
        if (this.lastRenderedCandleCount !== 0) {
          this.candleSeries.setData([]);
          this.lastRenderedCandleCount = 0;
        }
      } else {
        this.candleSeries.setData([]);
        this.lineSeries.setData([]);
        this.scrubSeries.setData([]);
        this.clearOverlayLines();
        this.clearStudyLines();
        this.hasFocusedSession = false;
        this.followLatestViewport = true;
        return;
      }

      if (this.scrubTime && (candles.length || spotSeries.length)) {
        const values = candles.length
          ? candles.flatMap((c) => [c.l, c.h])
          : spotSeries.map((p) => p.v);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const t = Math.floor(this.scrubTime / 1000) as Time;
        this.scrubSeries.setData([
          { time: t, value: min },
          { time: t, value: max },
        ]);
        this.hasFocusedSession = false;
      } else {
        this.scrubSeries.setData([]);
      }

      if (savedLogicalRange && seriesFullReset) {
        this.restoreLogicalRange(
          savedLogicalRange,
          useCandles ? candles.length - prevCandleCount : linePoints.length - prevLineCount,
        );
      } else if (
        this.followLatestViewport &&
        dataChanged &&
        prevCandleCount > 0 &&
        ((useCandles && candles.length > prevCandleCount) ||
          (!useCandles && linePoints.length > prevLineCount))
      ) {
        this.chart.timeScale().scrollToRealTime();
      }

      this.applyOverlayLines(activeSeries);
      this.applyStudyLines(candles);
      this.scheduleOverlayRedraw(candles, activeSeries);
    } catch (err) {
      console.warn('[spot-chart] render failed', err);
    }

    if (this.scrubTime) {
      this.focusScrubTime(candles, spotSeries);
      return;
    }

    if (this.followLatestViewport && !this.hasFocusedSession) {
      this.focusViewport(candles, spotSeries);
      this.ensurePatternsInViewport(candles);
    }
  }

  private applyCandleSeriesData(
    data: CandlestickData[],
    count: number,
    prevCount: number,
  ): boolean {
    if (!this.candleSeries) return false;

    const canIncremental =
      prevCount > 0 && count >= prevCount && count - prevCount <= 1;

    if (canIncremental && data.length) {
      this.candleSeries.update(data[data.length - 1]);
      this.lastRenderedCandleCount = count;
      return false;
    }

    this.candleSeries.setData(data);
    this.lastRenderedCandleCount = count;
    return true;
  }

  private applyLineSeriesData(
    data: LineData[],
    count: number,
    prevCount: number,
  ): boolean {
    if (!this.lineSeries) return false;

    const canIncremental =
      prevCount > 0 && count >= prevCount && count - prevCount <= 1;

    if (canIncremental && data.length) {
      this.lineSeries.update(data[data.length - 1]);
      this.lastRenderedLineCount = count;
      return false;
    }

    this.lineSeries.setData(data);
    this.lastRenderedLineCount = count;
    return true;
  }

  private restoreLogicalRange(
    range: LogicalRange,
    barsAdded: number,
  ): void {
    if (!this.chart) return;
    const next =
      barsAdded > 0
        ? { from: range.from + barsAdded, to: range.to + barsAdded }
        : range;
    this.suppressViewportFollow = true;
    try {
      this.chart.timeScale().setVisibleLogicalRange(next);
    } catch {
      /* range may be invalid after a full data reset */
    }
    requestAnimationFrame(() => {
      this.suppressViewportFollow = false;
    });
  }

  private resolveLinePoints(candles: Candle[], spotSeries: SpotPoint[]): SpotPoint[] {
    if (this.chartStyle === 'line' && candles.length) {
      return candles.map((c) => ({ t: c.t, v: c.c }));
    }
    return spotSeries;
  }

  private buildDataKey(candles: Candle[], series: SpotPoint[]): string {
    const lastCandle = candles[candles.length - 1];
    const lastSpot = series[series.length - 1];
    return `${candles.length}:${lastCandle?.t ?? 0}:${lastCandle?.c ?? 0}:${series.length}:${lastSpot?.t ?? 0}:${lastSpot?.v ?? 0}`;
  }

  private focusViewport(candles?: Candle[], series?: SpotPoint[]): void {
    if (!this.chart) return;
    const normalized = candles ?? this.normalizeCandles(this.candles);
    const points = series ?? this.filterSeriesToSession(this.spotSeries);

    if (normalized.length) {
      const visibleBars = this.defaultVisibleBars();
      const startIdx = Math.max(0, normalized.length - visibleBars);
      const fromSec = Math.floor(normalized[startIdx].t / 1000);
      const lastSec = Math.floor(normalized[normalized.length - 1].t / 1000);
      const barSec =
        this.timeframe === '5m' ? 300 : this.timeframe === '1h' ? 3600 : 900;
      const toSec = lastSec + barSec * 2;
      try {
        this.chart.timeScale().setVisibleRange({
          from: fromSec as Time,
          to: toSec as Time,
        });
        this.hasFocusedSession = true;
        this.followLatestViewport = true;
        return;
      } catch {
        this.fitChartContent();
        return;
      }
    }

    if (!points.length) return;

    const anchorMs = points[points.length - 1]?.t ?? Date.now();
    const session = this.buildIstChartSession(anchorMs);
    const lastSec = Math.floor(anchorMs / 1000);
    const fromSec = Math.floor(session.fromMs / 1000);
    const toSec = Math.max(lastSec + 300, Math.floor(session.closeMs / 1000));

    try {
      this.chart.timeScale().setVisibleRange({
        from: fromSec as Time,
        to: toSec as Time,
      });
      this.hasFocusedSession = true;
      this.followLatestViewport = true;
    } catch {
      this.fitChartContent();
    }
  }

  /** Default zoom window — full history remains scrollable to the left. */
  private defaultVisibleBars(): number {
    if (this.timeframe === '5m') return 156;
    if (this.timeframe === '1h') return 120;
    return 80;
  }

  private fitChartContent(): void {
    if (!this.chart) return;
    try {
      this.chart.timeScale().fitContent();
      this.hasFocusedSession = true;
    } catch {
      /* chart may not be ready */
    }
  }

  private focusScrubTime(candles: Candle[], series: SpotPoint[]): void {
    if (!this.chart || !this.scrubTime) return;
    const scrubSec = Math.floor(this.scrubTime / 1000);
    const barSec =
      this.timeframe === '5m' ? 300 : this.timeframe === '1h' ? 3600 : 900;
    const windowBars = this.timeframe === '5m' ? 48 : this.timeframe === '1h' ? 8 : 24;
    const halfWindow = Math.floor((windowBars * barSec) / 2);
    const fromSec = scrubSec - halfWindow;
    const toSec = scrubSec + halfWindow;
    try {
      this.chart.timeScale().setVisibleRange({
        from: fromSec as Time,
        to: toSec as Time,
      });
      this.hasFocusedSession = true;
      this.followLatestViewport = true;
    } catch {
      this.focusViewport(candles, series);
    }
  }

  private buildIstChartSession(anchorMs: number): IstChartSession {
    const sessionDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(anchorMs));

    const fromMs = new Date(`${sessionDate}T09:15:00+05:30`).getTime();
    const closeMs = new Date(`${sessionDate}T15:30:00+05:30`).getTime();
    const toMs = Math.min(Math.max(anchorMs, fromMs), closeMs);
    return { fromMs, toMs, closeMs };
  }

  private clearOverlayLines(): void {
    for (const entry of this.overlayPriceLines) {
      try {
        entry.series.removePriceLine(entry.line);
      } catch {
        /* ignore stale refs */
      }
    }
    this.overlayPriceLines = [];
  }

  private applyOverlayLines(series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null): void {
    this.clearOverlayLines();
    if (!series) return;

    for (const overlay of this.overlays) {
      if (!Number.isFinite(overlay.price)) continue;
      const priceLine = series.createPriceLine({
        price: overlay.price,
        color: overlay.color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: overlay.label,
      });
      this.overlayPriceLines.push({ line: priceLine, series });
    }
  }

  private filterSeriesToSession(series: SpotPoint[]): SpotPoint[] {
    if (!series.length) return series;
    const anchorMs = series[series.length - 1]?.t ?? Date.now();
    const session = this.buildIstChartSession(anchorMs);
    const filtered = series.filter(
      (p) => p.t >= session.fromMs && p.t <= session.closeMs + 5 * 60 * 1000,
    );
    return filtered.length ? filtered : series;
  }

  private normalizeCandles(candles: Candle[]): Candle[] {
    const sorted = [...candles]
      .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c))
      .sort((a, b) => a.t - b.t);

    const deduped: Candle[] = [];
    let lastSec = -1;
    for (const candle of sorted) {
      const sec = Math.floor(candle.t / 1000);
      if (sec === lastSec) {
        deduped[deduped.length - 1] = candle;
      } else {
        deduped.push(candle);
        lastSec = sec;
      }
    }
    return deduped;
  }

  private layerOn(id: string): boolean {
    return this.layers[id] !== false;
  }

  private clearStudyLines(): void {
    this.ema9Series?.setData([]);
    this.ema21Series?.setData([]);
    this.supportTrendSeries?.setData([]);
    this.resistanceTrendSeries?.setData([]);
  }

  private applyStudyLines(candles: Candle[]): void {
    if (!this.ema9Series || !this.ema21Series || !this.supportTrendSeries || !this.resistanceTrendSeries) {
      return;
    }

    if (!candles.length) {
      this.clearStudyLines();
      return;
    }

    try {
      const showEma9 = this.layerOn('ema9');
      const showEma21 = this.layerOn('ema21');
      const showSupportTrend = this.layerOn('supportTrend');
      const showResistanceTrend = this.layerOn('resistanceTrend');

      this.ema9Series.applyOptions({ visible: showEma9 });
      this.ema21Series.applyOptions({ visible: showEma21 });
      this.supportTrendSeries.applyOptions({ visible: showSupportTrend });
      this.resistanceTrendSeries.applyOptions({ visible: showResistanceTrend });

      this.ema9Series.setData(showEma9 ? this.computeEmaSeries(candles, 9) : []);
      this.ema21Series.setData(showEma21 ? this.computeEmaSeries(candles, 21) : []);

      const swingLows = this.findSwingLows(candles);
      const swingHighs = this.findSwingHighs(candles);

      if (showSupportTrend && swingLows.length >= 2) {
        const p1 = swingLows[swingLows.length - 2];
        const p2 = swingLows[swingLows.length - 1];
        this.supportTrendSeries.setData(this.buildTrendLinePoints(candles, p1, p2));
      } else {
        this.supportTrendSeries.setData([]);
      }

      if (showResistanceTrend && swingHighs.length >= 2) {
        const p1 = swingHighs[swingHighs.length - 2];
        const p2 = swingHighs[swingHighs.length - 1];
        this.resistanceTrendSeries.setData(this.buildTrendLinePoints(candles, p1, p2));
      } else {
        this.resistanceTrendSeries.setData([]);
      }
    } catch (err) {
      console.warn('[spot-chart] study lines failed', err);
      this.clearStudyLines();
    }
  }

  private scheduleOverlayRedraw(
    candles?: Candle[],
    series?: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null,
  ): void {
    if (this.overlayRedrawId != null) {
      cancelAnimationFrame(this.overlayRedrawId);
    }
    this.overlayRedrawId = requestAnimationFrame(() => {
      this.overlayRedrawId = null;
      this.drawPatternOverlay(
        candles ?? this.normalizeCandles(this.candles),
        series ??
          (this.chartStyle === 'candlestick' && this.candleSeries
            ? this.candleSeries
            : this.lineSeries),
      );
    });
  }

  private collectPatternDrawOps(candles: Candle[]): PatternDrawOp[] {
    const ops: PatternDrawOp[] = [];
    if (this.layerOn('chartPattern')) {
      const patterns = selectChartPatternsToPlot(
        this.patternInsights,
        this.timeframe,
      );
      patterns.forEach((insight, index) => {
        const fallbackNeckline =
          index === 0 && Number.isFinite(this.chartPatternNeckline)
            ? this.chartPatternNeckline
            : undefined;
        const built = buildChartPatternOps(insight, candles, fallbackNeckline);
        const highlighted = this.isHighlightedPattern(insight);
        built.forEach((op) =>
          ops.push({
            ...op,
            id: `${index}-${op.id}`,
            strokeWidth:
              highlighted && op.kind !== 'dot'
                ? Math.max(op.strokeWidth ?? 2, 3)
                : op.strokeWidth,
          }),
        );
        if (highlighted) {
          this.focusHighlightedPattern(insight, candles);
        }
      });
    }

    if (this.layerOn('candlestick')) {
      const insight = candlestickInsightForTf(this.patternInsights, this.timeframe);
      if (insight) {
        const highlighted = this.isHighlightedPattern(insight);
        ops.push(
          ...buildCandlestickHighlightOps(insight, candles, highlighted),
        );
        const marker = buildCandlestickMarkerOp(insight, candles, highlighted);
        if (marker) ops.push(marker);
        if (highlighted) {
          this.focusHighlightedCandlestick(insight, candles);
        }
      }
    }

    return ops;
  }

  private drawPatternOverlay(
    candles: Candle[],
    series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null,
  ): void {
    const svg = this.overlay?.nativeElement;
    if (!svg || !this.chart || !series || !candles.length) {
      if (svg) svg.innerHTML = '';
      return;
    }

    const { width, height } = svg.getBoundingClientRect();
    if (width < 2 || height < 2) {
      svg.innerHTML = '';
      return;
    }
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = '';

    const ops = this.collectPatternDrawOps(candles);
    if (!ops.length) return;

    const ns = 'http://www.w3.org/2000/svg';
    for (const op of ops) {
      const projected = op.points
        .map((point) => this.projectPoint(series, point.t, point.price))
        .filter((p): p is { x: number; y: number } => p != null);
      if (!projected.length) continue;

      if (op.kind === 'dot' && projected[0]) {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', String(projected[0].x));
        circle.setAttribute('cy', String(projected[0].y));
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', op.color);
        circle.setAttribute('stroke', '#0f172a');
        circle.setAttribute('stroke-width', '1');
        svg.appendChild(circle);
        continue;
      }

      if (op.kind === 'candleHighlight' && op.candle && projected.length >= 2) {
        const x = this.chart!.timeScale().timeToCoordinate(
          Math.floor(op.candle.t / 1000) as Time,
        );
        if (x == null || !Number.isFinite(x)) continue;

        const bodyTop = series.priceToCoordinate(Math.max(op.candle.o, op.candle.c));
        const bodyBottom = series.priceToCoordinate(Math.min(op.candle.o, op.candle.c));
        const wickTop = projected[0].y;
        const wickBottom = projected[1].y;
        if (
          bodyTop == null ||
          bodyBottom == null ||
          !Number.isFinite(bodyTop) ||
          !Number.isFinite(bodyBottom)
        ) {
          continue;
        }

        const halfBar = Math.max(4, this.barSpacing() * 0.45);
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', String(x - halfBar));
        rect.setAttribute('y', String(Math.min(wickTop, wickBottom)));
        rect.setAttribute('width', String(halfBar * 2));
        rect.setAttribute(
          'height',
          String(Math.abs(wickBottom - wickTop)),
        );
        rect.setAttribute('fill', op.fill ?? `${op.color}33`);
        rect.setAttribute('stroke', op.color);
        rect.setAttribute(
          'stroke-width',
          String(op.strokeWidth ?? (op.highlighted ? 2.5 : 1.5)),
        );
        rect.setAttribute('rx', '2');
        svg.appendChild(rect);

        const body = document.createElementNS(ns, 'rect');
        body.setAttribute('x', String(x - halfBar * 0.72));
        body.setAttribute('y', String(Math.min(bodyTop, bodyBottom)));
        body.setAttribute('width', String(halfBar * 1.44));
        body.setAttribute(
          'height',
          String(Math.max(2, Math.abs(bodyBottom - bodyTop))),
        );
        body.setAttribute('fill', op.highlighted ? `${op.color}aa` : `${op.color}66`);
        body.setAttribute('stroke', op.color);
        body.setAttribute('stroke-width', String(op.highlighted ? 2 : 1));
        svg.appendChild(body);
        continue;
      }

      if (op.kind === 'marker' && projected[0]) {
        const g = document.createElementNS(ns, 'g');
        const { x, y } = projected[0];
        const bullish = op.markerBullish ?? false;
        const marker = document.createElementNS(ns, 'path');
        const size = op.highlighted ? 9 : 7;
        const path = bullish
          ? `M ${x} ${y + size} L ${x - size} ${y - size} L ${x + size} ${y - size} Z`
          : `M ${x} ${y - size} L ${x - size} ${y + size} L ${x + size} ${y + size} Z`;
        marker.setAttribute('d', path);
        marker.setAttribute('fill', op.color);
        marker.setAttribute('stroke', op.highlighted ? '#f8fafc' : '#0f172a');
        marker.setAttribute('stroke-width', op.highlighted ? '2' : '1');
        g.appendChild(marker);

        if (op.label) {
          const label = document.createElementNS(ns, 'text');
          label.setAttribute('x', String(x));
          label.setAttribute('y', String(bullish ? y + 22 : y - 14));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('fill', op.color);
          label.setAttribute('font-size', '10');
          label.setAttribute('font-weight', '600');
          label.textContent = op.label;
          g.appendChild(label);
        }
        svg.appendChild(g);
        continue;
      }

      if (op.kind === 'hline' && projected.length >= 2) {
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(projected[0].x));
        line.setAttribute('y1', String(projected[0].y));
        line.setAttribute('x2', String(projected[projected.length - 1].x));
        line.setAttribute('y2', String(projected[projected.length - 1].y));
        line.setAttribute('stroke', op.color);
        line.setAttribute('stroke-width', String(op.strokeWidth ?? 1.5));
        if (op.dashed) line.setAttribute('stroke-dasharray', '6 4');
        svg.appendChild(line);
        continue;
      }

      if (op.kind === 'polygon' && projected.length >= 3) {
        const polygon = document.createElementNS(ns, 'polygon');
        polygon.setAttribute(
          'points',
          projected.map((p) => `${p.x},${p.y}`).join(' '),
        );
        polygon.setAttribute('fill', op.fill ?? `${op.color}22`);
        polygon.setAttribute('stroke', op.color);
        polygon.setAttribute('stroke-width', String(op.strokeWidth ?? 1.5));
        svg.appendChild(polygon);
        continue;
      }

      if (projected.length >= 2) {
        const polyline = document.createElementNS(ns, 'polyline');
        polyline.setAttribute(
          'points',
          projected.map((p) => `${p.x},${p.y}`).join(' '),
        );
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', op.color);
        polyline.setAttribute('stroke-width', String(op.strokeWidth ?? 2));
        if (op.dashed) polyline.setAttribute('stroke-dasharray', '6 4');
        svg.appendChild(polyline);

        if (op.label && projected[projected.length - 1]) {
          const label = document.createElementNS(ns, 'text');
          const anchor = projected[projected.length - 1];
          label.setAttribute('x', String(anchor.x + 6));
          label.setAttribute('y', String(anchor.y - 6));
          label.setAttribute('fill', op.color);
          label.setAttribute('font-size', '10');
          label.setAttribute('font-weight', '600');
          label.textContent = op.label;
          svg.appendChild(label);
        }
      }
    }
  }

  private projectPoint(
    series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
    tMs: number,
    price: number,
  ): { x: number; y: number } | null {
    if (!this.chart) return null;
    const time = Math.floor(tMs / 1000) as Time;
    const x = this.chart.timeScale().timeToCoordinate(time);
    const y = series.priceToCoordinate(price);
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  private isHighlightedPattern(insight: PatternInsight): boolean {
    if (!this.highlightPattern) return false;
    return (
      this.normalizeTimeframe(insight.timeframe) ===
        this.normalizeTimeframe(this.highlightPattern.timeframe) &&
      this.normalizePatternName(insight.pattern) ===
        this.normalizePatternName(this.highlightPattern.pattern)
    );
  }

  private ensurePatternsInViewport(candles: Candle[]): void {
    if (!this.chart || !candles.length || this.highlightPattern) return;
    if (!this.layerOn('chartPattern') && !this.layerOn('candlestick')) return;

    const bounds = collectPatternTimeBounds(
      this.patternInsights,
      this.timeframe,
      candles,
      this.chartPatternNeckline,
    );
    if (!bounds) return;

    const barMs =
      this.timeframe === '5m' ? 300_000 : this.timeframe === '1h' ? 3_600_000 : 900_000;
    const visibleBars = this.defaultVisibleBars();
    const defaultStartMs = candles[Math.max(0, candles.length - visibleBars)].t;
    const defaultEndMs = candles[candles.length - 1].t + barMs * 2;

    const startMs = Math.min(defaultStartMs, bounds.startMs);
    const endMs = Math.max(defaultEndMs, bounds.endMs);
    const pad = Math.max(barMs * 3, Math.round((endMs - startMs) * 0.08));

    try {
      this.chart.timeScale().setVisibleRange({
        from: Math.floor((startMs - pad) / 1000) as Time,
        to: Math.floor((endMs + pad) / 1000) as Time,
      });
      this.hasFocusedSession = true;
    } catch {
      /* keep default viewport */
    }
  }

  private focusHighlightedCandlestick(insight: PatternInsight, candles: Candle[]): void {
    if (!this.chart) return;
    const patternCandles = resolveCandlestickCandles(insight, candles);
    if (!patternCandles.length) return;

    const startMs = patternCandles[0].t;
    const endMs = patternCandles[patternCandles.length - 1].t;
    const barMs =
      this.timeframe === '5m' ? 300_000 : this.timeframe === '1h' ? 3_600_000 : 900_000;
    const pad = Math.max(barMs * 4, 8 * 60_000);

    try {
      this.chart.timeScale().setVisibleRange({
        from: Math.floor((startMs - pad) / 1000) as Time,
        to: Math.floor((endMs + pad) / 1000) as Time,
      });
      this.hasFocusedSession = true;
      this.followLatestViewport = false;
    } catch {
      this.focusViewport(candles);
    }
  }

  private focusHighlightedPattern(insight: PatternInsight, candles: Candle[]): void {
    if (!this.chart) return;
    const points = insight.points?.filter(
      (point) => Number.isFinite(point.t) && Number.isFinite(point.price),
    );
    if (!points?.length) return;

    const times = points
      .map((point) => point.t as number)
      .sort((a, b) => a - b);
    const startMs = times[0];
    const endMs = times[times.length - 1];
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs === endMs) {
      return;
    }

    const pad = Math.max(5 * 60_000, Math.round((endMs - startMs) * 0.35));
    try {
      this.chart.timeScale().setVisibleRange({
        from: Math.floor((startMs - pad) / 1000) as Time,
        to: Math.floor((endMs + pad) / 1000) as Time,
      });
      this.hasFocusedSession = true;
      this.followLatestViewport = false;
    } catch {
      this.focusViewport(candles);
    }
  }

  private normalizePatternName(pattern?: string): string {
    return (pattern ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  private normalizeTimeframe(value?: string): string {
    return (value ?? '').trim().toLowerCase();
  }

  private computeEmaSeries(candles: Candle[], period: number): LineData[] {
    if (!candles.length || period < 1) return [];
    const k = 2 / (period + 1);
    const out: LineData[] = [];
    let ema = candles[0].c;
    out.push({ time: Math.floor(candles[0].t / 1000) as Time, value: +ema.toFixed(2) });
    for (let i = 1; i < candles.length; i += 1) {
      ema = candles[i].c * k + ema * (1 - k);
      out.push({
        time: Math.floor(candles[i].t / 1000) as Time,
        value: +ema.toFixed(2),
      });
    }
    return out;
  }

  private findSwingLows(candles: Candle[], window = 2): Array<{ index: number; price: number }> {
    const swings: Array<{ index: number; price: number }> = [];
    for (let i = window; i < candles.length - window; i += 1) {
      const low = candles[i].l;
      let isSwing = true;
      for (let j = 1; j <= window; j += 1) {
        if (candles[i - j].l <= low || candles[i + j].l <= low) {
          isSwing = false;
          break;
        }
      }
      if (isSwing) swings.push({ index: i, price: low });
    }
    return swings;
  }

  private findSwingHighs(candles: Candle[], window = 2): Array<{ index: number; price: number }> {
    const swings: Array<{ index: number; price: number }> = [];
    for (let i = window; i < candles.length - window; i += 1) {
      const high = candles[i].h;
      let isSwing = true;
      for (let j = 1; j <= window; j += 1) {
        if (candles[i - j].h >= high || candles[i + j].h >= high) {
          isSwing = false;
          break;
        }
      }
      if (isSwing) swings.push({ index: i, price: high });
    }
    return swings;
  }

  private buildTrendLinePoints(
    candles: Candle[],
    p1: { index: number; price: number },
    p2: { index: number; price: number },
  ): LineData[] {
    if (!candles.length || p1.index === p2.index) return [];
    const slope = (p2.price - p1.price) / (p2.index - p1.index);
    const startIdx = Math.max(0, Math.min(p1.index, p2.index) - 3);
    const endIdx = candles.length - 1;
    const points: LineData[] = [];
    for (let i = startIdx; i <= endIdx; i += 1) {
      const price = p1.price + slope * (i - p1.index);
      points.push({
        time: Math.floor(candles[i].t / 1000) as Time,
        value: +price.toFixed(2),
      });
    }
    return points;
  }
}