import { Component, Input } from '@angular/core';
import {
  DeckComponentSignals,
  DeckTfComponentSignals,
} from '../../core/models/deck.models';

interface SignalBar {
  key: keyof DeckTfComponentSignals;
  label: string;
  value: number;
  readout: string;
  mode: 'bipolar' | 'rsi' | 'adx' | 'unipolar';
}

@Component({
  selector: 'app-pa-component-signals',
  standalone: true,
  template: `
    @if (timeframes().length) {
      <section class="pa-insight-card pa-component-signals" aria-label="Detector signals">
        <span class="pa-insight-card-title">Detector signals</span>
        <div class="pa-component-signals-grid">
          @for (tf of timeframes(); track tf) {
            <div class="pa-component-signals-tf" [class.primary]="tf === primaryTimeframe">
              <div class="pa-component-signals-tf-head">
                <span>{{ tf }}</span>
                @if (tf === primaryTimeframe) {
                  <span class="pa-insight-tf-badge">primary</span>
                }
              </div>
              <div class="pa-component-signals-bars">
                @for (bar of barsFor(tf); track bar.key) {
                  <div class="pa-signal-bar-row">
                    <span class="pa-signal-bar-label" [title]="bar.readout">
                      {{ bar.label }}
                    </span>
                    @if (bar.mode === 'bipolar') {
                      <div class="bipolar-track pa-signal-bar-track">
                        <div class="bipolar-mid"></div>
                        <div
                          class="bipolar-fill"
                          [class.positive]="bar.value >= 0"
                          [class.negative]="bar.value < 0"
                          [style.width.%]="bipolarFill(bar.value)"
                        ></div>
                      </div>
                    } @else if (bar.mode === 'rsi') {
                      <div class="pa-signal-meter pa-signal-meter-rsi">
                        <div
                          class="pa-signal-meter-fill"
                          [class.overbought]="bar.value >= 70"
                          [class.oversold]="bar.value <= 30"
                          [style.width.%]="bar.value"
                        ></div>
                        <div class="pa-signal-meter-mid" aria-hidden="true"></div>
                      </div>
                    } @else {
                      <div class="pa-signal-meter">
                        <div
                          class="pa-signal-meter-fill"
                          [style.width.%]="meterFill(bar.value, bar.mode)"
                        ></div>
                      </div>
                    }
                    <span class="pa-signal-bar-value">{{ bar.readout }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class PaComponentSignalsComponent {
  @Input() componentSignals?: DeckComponentSignals | null;
  @Input() primaryTimeframe = '15m';

  timeframes(): Array<'5m' | '15m' | '1h'> {
    if (!this.componentSignals) return [];
    return (['5m', '15m', '1h'] as const).filter((tf) => this.componentSignals?.[tf]);
  }

  barsFor(tf: '5m' | '15m' | '1h'): SignalBar[] {
    const signals = this.componentSignals?.[tf];
    if (!signals) return [];
    const defs: Array<{
      key: keyof DeckTfComponentSignals;
      label: string;
      mode: SignalBar['mode'];
    }> = [
      { key: 'structure', label: 'Structure', mode: 'bipolar' },
      { key: 'breakout', label: 'Breakout', mode: 'bipolar' },
      { key: 'retest', label: 'Retest', mode: 'bipolar' },
      { key: 'bos', label: 'BOS', mode: 'bipolar' },
      { key: 'choch', label: 'CHoCH', mode: 'bipolar' },
      { key: 'liquiditySweep', label: 'Liq sweep', mode: 'bipolar' },
      { key: 'volume', label: 'Volume', mode: 'bipolar' },
      { key: 'fakeout', label: 'Fakeout', mode: 'bipolar' },
      { key: 'trendBias', label: 'Trend bias', mode: 'bipolar' },
      { key: 'recentMomentum', label: 'Momentum', mode: 'bipolar' },
      { key: 'adx', label: 'ADX', mode: 'adx' },
      { key: 'rsi', label: 'RSI', mode: 'rsi' },
      { key: 'macd', label: 'MACD', mode: 'bipolar' },
      { key: 'emaTrend', label: 'EMA trend', mode: 'bipolar' },
      { key: 'bollinger', label: 'Bollinger', mode: 'bipolar' },
    ];
    return defs.map((def) => {
      const value = signals[def.key];
      return {
        ...def,
        value: Number.isFinite(value) ? value : 0,
        readout: this.formatReadout(def.key, value),
      };
    });
  }

  bipolarFill(value: number): number {
    const v = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    return Math.abs(v) * 50;
  }

  meterFill(value: number, mode: 'adx' | 'unipolar'): number {
    if (!Number.isFinite(value)) return 0;
    if (mode === 'adx') return Math.min(100, Math.max(0, value));
    return Math.min(100, Math.max(0, Math.abs(value) * 100));
  }

  private formatReadout(
    key: keyof DeckTfComponentSignals,
    value: number,
  ): string {
    if (!Number.isFinite(value)) return '—';
    if (key === 'rsi') return value.toFixed(1);
    if (key === 'adx') return value.toFixed(1);
    if (key === 'macd') return value >= 0 ? `+${value.toFixed(3)}` : value.toFixed(3);
    if (key === 'emaTrend' || key === 'bollinger') {
      if (value > 0.25) return 'bull';
      if (value < -0.25) return 'bear';
      return 'flat';
    }
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}`;
  }
}