import { Component, Input } from '@angular/core';
import {
  DeckGaugeReading,
  DeckLiveTick,
  DeckMarketRegime,
  PaDrilldown,
} from '../../core/models/deck.models';
import { drilldownRow, drilldownSection } from './pa-drilldown-utils';

export type PaInsightView = 'overview' | 'timeframes' | 'context';

interface InsightChip {
  id: string;
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral' | 'warn';
  detail?: string;
  meter?: number;
}

@Component({
  selector: 'app-pa-signal-insights',
  standalone: true,
  template: `
    <section class="pa-signal-insights" aria-label="Price action quick reads">
      @if (showOverview() && (chips().length || tfAligned != null)) {
        <div class="pa-insight-hero">
          @if (tfAligned != null) {
            <div class="pa-insight-align-ring" [attr.title]="'Timeframes sharing primary direction'">
              <svg
                [attr.viewBox]="'0 0 ' + alignRingSize + ' ' + alignRingSize"
                aria-hidden="true"
              >
                <circle
                  class="pa-align-ring-bg"
                  [attr.cx]="alignRingCenter"
                  [attr.cy]="alignRingCenter"
                  [attr.r]="alignRingRadius"
                  fill="none"
                  stroke-width="6"
                />
                <circle
                  class="pa-align-ring-fill"
                  [class]="'tone-' + alignTone()"
                  [attr.cx]="alignRingCenter"
                  [attr.cy]="alignRingCenter"
                  [attr.r]="alignRingRadius"
                  fill="none"
                  stroke-width="6"
                  stroke-linecap="round"
                  [attr.stroke-dasharray]="alignDash()"
                  [attr.transform]="'rotate(-90 ' + alignRingCenter + ' ' + alignRingCenter + ')'"
                />
              </svg>
              <div class="pa-align-ring-label">
                <span class="pa-align-ring-value">{{ tfAligned }}/{{ tfAlignedTotal ?? 3 }}</span>
                <span class="pa-align-ring-caption">TF align</span>
              </div>
            </div>
          }
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
                  @if (chip.meter != null) {
                    <div class="pa-insight-chip-meter">
                      <div
                        class="pa-insight-chip-meter-fill"
                        [style.width.%]="chip.meter"
                      ></div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      @if (showContext() && levelItems().length) {
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

      @if (showContext() && contextItems().length) {
        <div class="pa-insight-card">
          <span class="pa-insight-card-title">Market context</span>
          <div class="pa-insight-context-chips">
            @for (item of contextItems(); track item.label) {
              <span
                class="pa-insight-context-chip"
                [class]="item.tone ? 'tone-' + item.tone : ''"
              >
                <span class="pa-insight-context-chip-label">{{ item.label }}</span>
                <span class="pa-insight-context-chip-value">{{ item.value }}</span>
              </span>
            }
          </div>
        </div>
      }

      @if (showContext() && patternTags().length) {
        <div class="pa-insight-card">
          <span class="pa-insight-card-title">Active patterns</span>
          <div class="pa-insight-pattern-tags">
            @for (tag of patternTags(); track tag) {
              <span class="pa-insight-pattern-tag">{{ tag }}</span>
            }
          </div>
        </div>
      }

      @if (showTimeframes() && tfSnapshots().length) {
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
                <div class="bipolar-track pa-insight-tf-bar">
                  <div class="bipolar-mid"></div>
                  <div
                    class="bipolar-fill"
                    [class.positive]="tf.numericScore >= 0"
                    [class.negative]="tf.numericScore < 0"
                    [style.width.%]="tfBarWidth(tf.numericScore)"
                  ></div>
                </div>
                @if (tf.candle) {
                  <span class="pa-insight-tf-meta">{{ tf.candle }}</span>
                }
              </div>
            }
          </div>
        </div>
      }

      @if (showOverview() && convictionSeries?.length) {
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
            <defs>
              <linearGradient id="paSparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--pa, #a78bfa)" stop-opacity="0.35" />
                <stop offset="100%" stop-color="var(--pa, #a78bfa)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <polygon
              class="pa-insight-spark-area"
              [attr.points]="sparkAreaPoints()"
              fill="url(#paSparkFill)"
            />
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

      @if (showOverview() && statusNotes().length) {
        <div class="pa-insight-status-row">
          @for (note of statusNotes(); track note.id) {
            <span class="pa-insight-status-chip" [class]="note.tone">{{ note.text }}</span>
          }
        </div>
      }

      @if (emptyView()) {
        <p class="pa-insight-empty">{{ emptyView() }}</p>
      }
    </section>
  `,
})
export class PaSignalInsightsComponent {
  readonly sparkWidth = 280;
  readonly sparkHeight = 44;
  readonly alignRingSize = 80;
  readonly alignRingRadius = 31;
  readonly alignRingCenter = this.alignRingSize / 2;

  @Input() view: PaInsightView = 'overview';
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

  showOverview(): boolean {
    return this.view === 'overview';
  }

  showTimeframes(): boolean {
    return this.view === 'timeframes';
  }

  showContext(): boolean {
    return this.view === 'context';
  }

  emptyView(): string | null {
    if (this.view === 'overview') {
      const hasHero = this.chips().length > 0 || this.tfAligned != null;
      const hasSpark = (this.convictionSeries?.length ?? 0) > 0;
      const hasNotes = this.statusNotes().length > 0;
      if (!hasHero && !hasSpark && !hasNotes) {
        return 'No overview metrics yet — waiting for the next signal tick.';
      }
      return null;
    }
    if (this.view === 'timeframes' && !this.tfSnapshots().length) {
      return 'No timeframe breakdown available for this tick.';
    }
    if (
      this.view === 'context' &&
      !this.levelItems().length &&
      !this.contextItems().length &&
      !this.patternTags().length
    ) {
      return 'No levels, context, or patterns on this tick.';
    }
    return null;
  }

  alignTone(): InsightChip['tone'] {
    const aligned = this.tfAligned ?? 0;
    if (aligned >= 2) return 'positive';
    if (aligned === 1) return 'warn';
    return 'negative';
  }

  alignDash(): string {
    const total = Math.max(1, this.tfAlignedTotal ?? 3);
    const aligned = Math.max(0, Math.min(total, this.tfAligned ?? 0));
    const circumference = 2 * Math.PI * this.alignRingRadius;
    const filled = (aligned / total) * circumference;
    return `${filled.toFixed(1)} ${circumference.toFixed(1)}`;
  }

  tfBarWidth(value: number): number {
    const v = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    return Math.abs(v) * 50;
  }

  chips(): InsightChip[] {
    const chips: InsightChip[] = [];

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
        meter: 100,
      });
    } else {
      const meter = Math.min(
        100,
        Math.round((this.conviction / Math.max(1, this.entryThreshold)) * 100),
      );
      chips.push({
        id: 'entry',
        label: 'Entry gate',
        value: `${this.conviction}%`,
        tone: 'warn',
        detail: `Needs ${this.entryThreshold}%`,
        meter,
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

  patternTags(): string[] {
    const insights = this.patternInsights?.filter(
      (row) => row.pattern && !/^none$/i.test(row.pattern),
    );
    if (!insights?.length) return [];
    return insights.slice(0, 8).map((row) => `${row.timeframe} ${row.pattern}`);
  }

  tfSnapshots(): Array<{
    timeframe: string;
    score: string;
    numericScore: number;
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
          numericScore: this.parseScore(score.value),
          scoreTone: score.tone,
          candle: candle?.value,
          primary: tf === primary,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  statusNotes(): Array<{ id: string; text: string; tone: string }> {
    const notes: Array<{ id: string; text: string; tone: string }> = [];
    const ghost = this.ghostDelta();
    if (ghost != null) {
      notes.push({
        id: 'ghost',
        text: `Momentum decay ${ghost >= 0 ? '+' : ''}${ghost.toFixed(2)}`,
        tone: 'ghost',
      });
    }
    const gate = this.gateNote();
    if (gate) {
      notes.push({ id: 'gate', text: gate, tone: 'gate' });
    }
    return notes;
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

  sparkAreaPoints(): string {
    const line = this.sparkPoints();
    if (!line) return '';
    const firstX = line.split(' ')[0].split(',')[0];
    const lastX = line.split(' ').at(-1)?.split(',')[0] ?? firstX;
    const baseline = this.sparkHeight - 2;
    return `${firstX},${baseline} ${line} ${lastX},${baseline}`;
  }

  private parseScore(value: string): number {
    const match = value.match(/([+-]?\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const num = Number.parseFloat(match[1]);
    if (!Number.isFinite(num)) return 0;
    if (/PE/i.test(value)) return -Math.abs(num);
    if (/CE/i.test(value)) return Math.abs(num);
    return num;
  }

  private ghostDelta(): number | null {
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

  private gateNote(): string | null {
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
      return `Structure ${this.structuralAction} · action ${this.action}`;
    }
    const penalties = drilldownRow(this.paDrilldown, 'signal-gates', 'Penalties');
    if (penalties && this.action === 'NO-TRADE') {
      return `Penalties: ${penalties.value}`;
    }
    return null;
  }
}