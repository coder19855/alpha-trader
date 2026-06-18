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
  Time,
  createChart,
} from 'lightweight-charts';
import { ChartOverlayLine } from '../../core/models/deck.models';

type Candle = { t: number; o: number; h: number; l: number; c: number };
type SpotPoint = { t: number; v: number };

interface IstChartSession {
  fromMs: number;
  toMs: number;
  closeMs: number;
}

@Component({
  selector: 'app-spot-chart',
  standalone: true,
  template: `<div #container class="chart-host"></div>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-height: 280px;
      }
      .chart-host {
        width: 100%;
        height: 280px;
        min-height: 280px;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--border);
        background: var(--chart-bg, var(--surface));
      }
    `,
  ],
})
export class SpotChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;
  @Input() candles: Candle[] = [];
  @Input() spotSeries: SpotPoint[] = [];
  @Input() scrubTime: number | null = null;
  @Input() overlays: ChartOverlayLine[] = [];
  @Input() timeframe: '5m' | '15m' | '1h' = '15m';
  @Input() layers: Record<string, boolean> = {};

  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<'Candlestick'> | null = null;
  private lineSeries: ISeriesApi<'Line'> | null = null;
  private scrubSeries: ISeriesApi<'Line'> | null = null;
  private ema9Series: ISeriesApi<'Line'> | null = null;
  private ema21Series: ISeriesApi<'Line'> | null = null;
  private supportTrendSeries: ISeriesApi<'Line'> | null = null;
  private resistanceTrendSeries: ISeriesApi<'Line'> | null = null;
  private overlayPriceLines: Array<{
    line: IPriceLine;
    series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
  }> = [];
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private initRetryId: number | null = null;
  private userAdjustedViewport = false;
  private hasFocusedSession = false;
  private lastDataKey = '';

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
      this.userAdjustedViewport = false;
      this.applyTimeframeOptions();
    }

    if (
      changes['candles'] ||
      changes['spotSeries'] ||
      changes['scrubTime'] ||
      changes['overlays'] ||
      changes['layers']
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
      this.userAdjustedViewport = false;
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
    if (!this.userAdjustedViewport && !this.hasFocusedSession) {
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
    this.hasFocusedSession = false;
    this.userAdjustedViewport = false;
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
      if (range && this.hasFocusedSession) {
        this.userAdjustedViewport = true;
      }
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
    if (this.timeframe === '5m') return 18;
    if (this.timeframe === '1h') return 4;
    return 10;
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

    const normalized = this.normalizeCandles(this.candles);
    const candles = this.filterCandlesToSession(normalized);
    const spotSeries = this.filterSeriesToSession(this.spotSeries);
    const dataKey = this.buildDataKey(candles, spotSeries);
    const dataChanged = dataKey !== this.lastDataKey;
    this.lastDataKey = dataKey;

    const activeSeries =
      candles.length > 0 ? this.candleSeries : spotSeries.length ? this.lineSeries : null;

    try {
      if (candles.length) {
        const data: CandlestickData[] = candles.map((c) => ({
          time: Math.floor(c.t / 1000) as Time,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        }));
        this.candleSeries.setData(data);
        this.lineSeries.setData([]);
      } else if (spotSeries.length) {
        const data: LineData[] = spotSeries.map((p) => ({
          time: Math.floor(p.t / 1000) as Time,
          value: p.v,
        }));
        this.lineSeries.setData(data);
        this.candleSeries.setData([]);
      } else {
        this.candleSeries.setData([]);
        this.lineSeries.setData([]);
        this.scrubSeries.setData([]);
        this.clearOverlayLines();
        this.clearStudyLines();
        this.hasFocusedSession = false;
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
        this.userAdjustedViewport = false;
        this.hasFocusedSession = false;
      } else {
        this.scrubSeries.setData([]);
      }

      this.applyOverlayLines(activeSeries);
      this.applyStudyLines(candles);
    } catch (err) {
      console.warn('[spot-chart] render failed', err);
    }

    if (this.scrubTime) {
      this.focusScrubTime(candles, spotSeries);
      return;
    }

    if (!this.userAdjustedViewport && (dataChanged || !this.hasFocusedSession)) {
      this.focusViewport(candles, spotSeries);
    }
  }

  private buildDataKey(candles: Candle[], series: SpotPoint[]): string {
    const lastCandle = candles[candles.length - 1];
    const lastSpot = series[series.length - 1];
    return `${candles.length}:${lastCandle?.t ?? 0}:${series.length}:${lastSpot?.t ?? 0}`;
  }

  private focusViewport(candles?: Candle[], series?: SpotPoint[]): void {
    if (!this.chart) return;
    const normalized = candles ?? this.filterCandlesToSession(this.normalizeCandles(this.candles));
    const points = series ?? this.filterSeriesToSession(this.spotSeries);

    if (!normalized.length && !points.length) return;

    const anchorMs =
      normalized[normalized.length - 1]?.t ??
      points[points.length - 1]?.t ??
      Date.now();
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
    } catch {
      this.fitChartContent();
    }
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

  private filterCandlesToSession(candles: Candle[]): Candle[] {
    if (!candles.length) return candles;
    const anchorMs = candles[candles.length - 1]?.t ?? Date.now();
    const session = this.buildIstChartSession(anchorMs);
    const filtered = candles.filter(
      (c) => c.t >= session.fromMs && c.t <= session.closeMs + 5 * 60 * 1000,
    );
    return filtered.length ? filtered : candles;
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