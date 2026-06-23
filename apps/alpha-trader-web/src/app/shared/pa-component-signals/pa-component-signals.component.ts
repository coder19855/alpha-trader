import { Component, Input } from '@angular/core';
import {
  DeckComponentSignals,
  DeckTfComponentSignals,
} from '../../core/models/deck.models';

interface SignalRow {
  key: keyof DeckTfComponentSignals;
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral' | 'warn';
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
              <div class="pa-component-signals-rows">
                @for (row of rowsFor(tf); track row.key) {
                  <div class="pa-component-signals-row">
                    <span class="pa-component-signals-label">{{ row.label }}</span>
                    <span
                      class="pa-component-signals-value"
                      [class]="'tone-' + row.tone"
                    >
                      {{ row.value }}
                    </span>
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

  rowsFor(tf: '5m' | '15m' | '1h'): SignalRow[] {
    const signals = this.componentSignals?.[tf];
    if (!signals) return [];
    const defs: Array<{ key: keyof DeckTfComponentSignals; label: string }> = [
      { key: 'structure', label: 'Structure' },
      { key: 'breakout', label: 'Breakout' },
      { key: 'retest', label: 'Retest' },
      { key: 'bos', label: 'BOS' },
      { key: 'choch', label: 'CHoCH' },
      { key: 'liquiditySweep', label: 'Liq sweep' },
      { key: 'volume', label: 'Volume' },
      { key: 'fakeout', label: 'Fakeout' },
      { key: 'trendBias', label: 'Trend bias' },
      { key: 'recentMomentum', label: 'Momentum' },
      { key: 'adx', label: 'ADX' },
      { key: 'rsi', label: 'RSI' },
      { key: 'macd', label: 'MACD' },
      { key: 'emaTrend', label: 'EMA trend' },
      { key: 'bollinger', label: 'Bollinger' },
    ];
    return defs.map((def) => ({
      ...def,
      value: this.formatValue(def.key, signals[def.key]),
      tone: this.toneFor(def.key, signals[def.key]),
    }));
  }

  private formatValue(
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
      return 'neutral';
    }
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}`;
  }

  private toneFor(
    key: keyof DeckTfComponentSignals,
    value: number,
  ): SignalRow['tone'] {
    if (!Number.isFinite(value)) return 'neutral';
    if (key === 'rsi') {
      if (value >= 70) return 'negative';
      if (value <= 30) return 'positive';
      return 'neutral';
    }
    if (key === 'adx') return value >= 20 ? 'positive' : value < 15 ? 'warn' : 'neutral';
    if (key === 'emaTrend' || key === 'bollinger') {
      if (value > 0.25) return 'positive';
      if (value < -0.25) return 'negative';
      return 'neutral';
    }
    if (Math.abs(value) < 0.08) return 'neutral';
    return value > 0 ? 'positive' : 'negative';
  }
}