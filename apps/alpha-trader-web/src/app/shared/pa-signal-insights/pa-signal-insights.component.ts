import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  DeckGaugeReading,
  DeckLiveTick,
  DeckMarketRegime,
  PaDrilldown,
} from '../../core/models/deck.models';
import { drilldownRow, drilldownSection } from './pa-drilldown-utils';

interface InsightChip {
  id: string;
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral' | 'warn';
  detail?: string;
}

@Component({
  selector: 'app-pa-signal-insights',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <section class="pa-signal-insights" aria-label="Price action quick reads">
      @if (chips().length) {
        <div class="pa-insight-chips">
          @for (chip of chips(); track chip.id) {
            <div
              class="pa-insight-chip"
              [class]="'tone-' + chip.tone"
              [attr.title]="chip.detail || null"
            >
              <span class="pa-insight-chip-label">{{ chip.label }}</span>
              <span class="pa-insight-chip-value">{{ chip.value }}</span>
            </div>
          }
        </div>
      }

      @if (levelItems().length) {
        <div class="pa-insight-card">
          <span class="pa-insight-card-title">Key levels</span>
          <div class="pa-insight-levels">
            @for (item of levelItems(); track item.label) {
              <span class="pa-insight-level" [class]="item.tone ? 'tone-' + item.tone : ''">
                <span class="pa-insight-level-label">{{ item.label }}</span>
                <span class="pa-insight-level-value">{{ item.value }}</span>
              </span>
            }
          </div>
        </div>
      }

      @if (contextItems().length) {
        <div class="pa-insight-card">
          <span class="pa-insight-card-title">Market context</span>
          <div class="pa-insight-context-grid">
            @for (item of contextItems(); track item.label) {
              <div class="pa-insight-context-row">
                <span class="pa-insight-context-label">{{ item.label }}</span>
                <span
                  class="pa-insight-context-value"
                  [class]="item.tone ? 'tone-' + item.tone : ''"
                >
                  {{ item.value }}
                </span>
              </div>
            }
          </div>
        </div>
      }

      @if (patternSummary()) {
        <div class="pa-insight-card">
          <span class="pa-insight-card-title">Active patterns</span>
          <p class="pa-insight-patterns">{{ patternSummary() }}</p>
        </div>
      }

      @if (tfSnapshots().length) {
        <div class="pa-insight-card">
          <span class="pa-insight-card-title">Timeframe snapshot</span>
          <div class="pa-insight-tf-grid">
            @for (tf of tfSnapshots(); track tf.timeframe) {
              <div class="pa-insight-tf-card" [class.primary]="tf.primary">
                <span class="pa-insight-tf-head">
                  {{ tf.timeframe }}
                  @if (tf.primary) {
                    <span class="pa-insight-tf-badge">primary</span>
                  }
                </span>
                <span
                  class="pa-insight-tf-score"
                  [class]="tf.scoreTone ? 'tone-' + tf.scoreTone : ''"
                >
                  {{ tf.score }}
                </span>
                @if (tf.candle) {
                  <span class="pa-insight-tf-meta">{{ tf.candle }}</span>
                }
              </div>
            }
          </div>
        </div>
      }

      @if (convictionSeries?.length) {
        <div class="pa-insight-card">
          <div class="pa-insight-card-head">
            <span class="pa-insight-card-title">PA conviction today</span>
            <span class="pa-insight-spark-meta">
              {{ convictionSeries![convictionSeries!.length - 1].priceAction }}% now
            </span>
          </div>
          <svg
            class="pa-insight-sparkline"
            [attr.viewBox]="'0 0 ' + sparkWidth + ' ' + sparkHeight"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              [attr.points]="sparkPoints()"
              fill="none"
              stroke="var(--pa, #a78bfa)"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
        </div>
      }

      @if (ghostDelta() != null) {
        <p class="pa-insight-ghost-note" role="status">
          Momentum decay ghost:
          <strong>{{ ghostDelta()! >= 0 ? '+' : '' }}{{ ghostDelta()! | number: '1.2-2' }}</strong>
          on the bipolar needle — faded direction before gates.
        </p>
      }

      @if (gateNote()) {
        <p class="pa-insight-gate-note" role="status">{{ gateNote() }}</p>
      }
    </section>
  `,
})
export class PaSignalInsightsComponent {
  readonly sparkWidth = 280;
  readonly sparkHeight = 44;

  @Input() action = 'NO-TRADE';
  @Input() structuralAction?: string;
  @Input() vetoReason?: string;
  @Input() chartVetoed = false;
  @Input() conviction = 0;
  @Input() entryThreshold = 60;
  @Input() tfAligned?: number;
  @Input() tfAlignedTotal?: number;
  @Input() paDrilldown?: PaDrilldown | null;
  @Input() patternInsights?: DeckLiveTick['patternInsights'];
  @Input() convictionSeries?: DeckLiveTick['convictionSeries'];
  @Input() reading?: DeckGaugeReading;
  @Input() marketRegime?: DeckMarketRegime | null;

  chips(): InsightChip[] {
    const chips: InsightChip[] = [];

    if (this.tfAligned != null) {
      const total = this.tfAlignedTotal ?? 3;
      const tone =
        this.tfAligned >= 2 ? 'positive' : this.tfAligned === 1 ? 'warn' : 'negative';
      chips.push({
        id: 'tf-align',
        label: 'TF alignment',
        value: `${this.tfAligned}/${total}`,
        tone,
        detail: 'Timeframes sharing primary direction',
      });
    }

    const structural = this.structuralAction || this.action;
    if (structural && structural !== 'NO-TRADE') {
      chips.push({
        id: 'structural',
        label: 'Structure',
        value: structural,
        tone: structural.includes('CE') ? 'positive' : 'negative',
        detail: 'Directional read before hard gates',
      });
    }

    const strength = drilldownRow(this.paDrilldown, 'signal-gates', 'Strength');
    if (strength) {
      chips.push({
        id: 'strength',
        label: 'Strength',
        value: strength.value,
        tone:
          strength.value === 'HIGH'
            ? 'positive'
            : strength.value === 'LOW'
              ? 'warn'
              : 'neutral',
      });
    }

    const mtf = drilldownRow(this.paDrilldown, 'confluence', 'MTF score');
    if (mtf) {
      chips.push({
        id: 'mtf',
        label: 'MTF stack',
        value: mtf.value,
        tone: (mtf.tone as InsightChip['tone']) ?? 'neutral',
      });
    }

    if (this.conviction >= this.entryThreshold) {
      chips.push({
        id: 'entry',
        label: 'Entry gate',
        value: 'Met',
        tone: 'positive',
        detail: `${this.conviction}% ≥ ${this.entryThreshold}%`,
      });
    } else {
      chips.push({
        id: 'entry',
        label: 'Entry gate',
        value: `${this.conviction}%`,
        tone: 'warn',
        detail: `Needs ${this.entryThreshold}%`,
      });
    }

    if (this.marketRegime?.pollsInRegime && this.marketRegime.pollsInRegime > 1) {
      chips.push({
        id: 'regime-stable',
        label: 'Regime stable',
        value: `${this.marketRegime.pollsInRegime} polls`,
        tone: this.marketRegime.confirming ? 'warn' : 'neutral',
        detail: this.marketRegime.hint,
      });
    }

    return chips;
  }

  levelItems(): Array<{ label: string; value: string; tone?: string }> {
    const rows = drilldownSection(this.paDrilldown, 'levels');
    return rows.map((row) => ({
      label: row.label,
      value: row.value,
      tone: row.tone,
    }));
  }

  contextItems(): Array<{ label: string; value: string; tone?: string }> {
    const wanted = [
      'Session',
      'Session bias',
      'Volatility',
      'Trend quality',
      'Trend drivers',
      'Chart pattern',
      'Primary candle',
      'Dead market',
    ];
    const rows = drilldownSection(this.paDrilldown, 'market-context');
    return rows
      .filter((row) => wanted.includes(row.label))
      .map((row) => ({
        label: row.label,
        value: row.value,
        tone: row.tone,
      }));
  }

  patternSummary(): string | null {
    const insights = this.patternInsights?.filter(
      (row) => row.pattern && !/^none$/i.test(row.pattern),
    );
    if (!insights?.length) return null;
    return insights
      .slice(0, 6)
      .map((row) => `${row.timeframe} ${row.pattern}`)
      .join(' · ');
  }

  tfSnapshots(): Array<{
    timeframe: string;
    score: string;
    scoreTone?: string;
    candle?: string;
    primary: boolean;
  }> {
    const primary = (this.paDrilldown?.primaryTimeframe ?? '15m').toLowerCase();
    const tfs = ['5m', '15m', '1h'];
    return tfs
      .map((tf) => {
        const section = this.paDrilldown?.sections?.find((s) => s.id === `tf-${tf}`);
        if (!section) return null;
        const score = section.rows.find((r) => r.label === 'Structure score');
        const candle = section.rows.find((r) => r.label === 'Candlestick');
        if (!score) return null;
        return {
          timeframe: tf,
          score: score.value,
          scoreTone: score.tone,
          candle: candle?.value,
          primary: tf === primary,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  sparkPoints(): string {
    const series = this.convictionSeries ?? [];
    if (series.length < 2) return '';
    const values = series.map((p) => p.priceAction);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const step = this.sparkWidth / Math.max(1, values.length - 1);
    return values
      .map((value, index) => {
        const x = +(index * step).toFixed(1);
        const y = +(
          this.sparkHeight -
          4 -
          ((value - min) / span) * (this.sparkHeight - 8)
        ).toFixed(1);
        return `${x},${y}`;
      })
      .join(' ');
  }

  ghostDelta(): number | null {
    const reading = this.reading;
    if (
      !reading ||
      reading.ghost == null ||
      !Number.isFinite(reading.ghost) ||
      !Number.isFinite(reading.value)
    ) {
      return null;
    }
    const delta = reading.ghost - reading.value;
    if (Math.abs(delta) < 0.04) return null;
    return delta;
  }

  gateNote(): string | null {
    if (this.chartVetoed && this.vetoReason) {
      return `Chart veto: ${this.vetoReason}`;
    }
    const structural = drilldownRow(this.paDrilldown, 'signal-gates', 'Structural read');
    if (
      structural &&
      this.structuralAction &&
      this.action !== this.structuralAction &&
      this.action === 'NO-TRADE'
    ) {
      return `Structure suggests ${this.structuralAction}; chart action is ${this.action}.`;
    }
    const penalties = drilldownRow(this.paDrilldown, 'signal-gates', 'Penalties');
    if (penalties && this.action === 'NO-TRADE') {
      return `Entry penalties active — ${penalties.value}`;
    }
    return null;
  }
}