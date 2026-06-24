import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DeckPositionRrTracker } from '../../core/models/deck.models';

interface LadderMarker {
  id: string;
  label: string;
  price: number;
  tone: 'entry' | 'stop' | 'be' | 'tp' | 'spot';
  detail?: string;
}

@Component({
  selector: 'app-position-rr-tracker',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    @if (rrTracker; as t) {
      <section class="pos-rr-tracker" aria-label="Position R:R milestones">
        <div class="pos-rr-head">
          <span class="pos-rr-title">Trade milestones</span>
          @if (t.currentR != null) {
            <span class="pos-rr-r" [class.positive]="t.currentR >= 0" [class.negative]="t.currentR < 0">
              {{ t.currentR >= 0 ? '+' : '' }}{{ t.currentR | number: '1.2-2' }}R
            </span>
          }
        </div>

        <div class="pos-rr-ladder" aria-hidden="true">
          <div class="pos-rr-track">
            @for (marker of markers(); track marker.id) {
              <div
                class="pos-rr-marker"
                [class]="'tone-' + marker.tone"
                [style.left.%]="markerLeft(marker.price)"
                [attr.title]="marker.detail || marker.label"
              >
                <span class="pos-rr-tick"></span>
                <span class="pos-rr-label">{{ marker.label }}</span>
              </div>
            }
            @if (spotMarker(); as spot) {
              <div
                class="pos-rr-marker tone-spot"
                [style.left.%]="markerLeft(spot.price)"
                [attr.title]="spot.detail"
              >
                <span class="pos-rr-spot-pin"></span>
                <span class="pos-rr-label">Spot</span>
              </div>
            }
          </div>
          <div class="pos-rr-risk-band" [style]="riskBandStyle()"></div>
          <div class="pos-rr-profit-band" [style]="profitBandStyle()"></div>
        </div>

        <div class="pos-rr-legend">
          @for (level of t.levels; track level.id) {
            <span class="pos-rr-legend-item" [class]="'kind-' + level.kind">
              <span class="dot"></span>
              {{ level.label }}
              <strong>{{ level.price | number: '1.0-0' }}</strong>
            </span>
          }
        </div>
      </section>
    }
  `,
  styles: [
    `
      .pos-rr-tracker {
        margin: 10px 0 4px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(34, 211, 238, 0.22);
        background: linear-gradient(180deg, rgba(34, 211, 238, 0.06), transparent);
      }
      .pos-rr-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }
      .pos-rr-title {
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .pos-rr-r {
        font-size: 0.78rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }
      .pos-rr-r.positive {
        color: #4ade80;
      }
      .pos-rr-r.negative {
        color: #f87171;
      }
      .pos-rr-ladder {
        position: relative;
        height: 52px;
        margin-bottom: 8px;
      }
      .pos-rr-track {
        position: relative;
        height: 100%;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(148, 163, 184, 0.12);
      }
      .pos-rr-risk-band,
      .pos-rr-profit-band {
        position: absolute;
        top: 8px;
        height: 36px;
        border-radius: 6px;
        pointer-events: none;
      }
      .pos-rr-risk-band {
        background: rgba(239, 68, 68, 0.12);
        border: 1px dashed rgba(239, 68, 68, 0.35);
      }
      .pos-rr-profit-band {
        background: rgba(74, 222, 128, 0.08);
        border: 1px dashed rgba(74, 222, 128, 0.28);
      }
      .pos-rr-marker {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 28px;
      }
      .pos-rr-tick {
        width: 2px;
        height: 28px;
        border-radius: 1px;
        background: currentColor;
      }
      .pos-rr-spot-pin {
        width: 10px;
        height: 10px;
        margin-top: 9px;
        border-radius: 999px;
        background: #f8fafc;
        box-shadow: 0 0 0 2px rgba(248, 250, 252, 0.25);
      }
      .pos-rr-label {
        margin-top: 2px;
        font-size: 0.58rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        white-space: nowrap;
      }
      .tone-entry {
        color: #22d3ee;
      }
      .tone-stop {
        color: #ef4444;
      }
      .tone-be {
        color: #fbbf24;
      }
      .tone-tp {
        color: #4ade80;
      }
      .tone-spot {
        color: #f8fafc;
        z-index: 2;
      }
      .pos-rr-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 10px;
      }
      .pos-rr-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.62rem;
        color: var(--muted);
      }
      .pos-rr-legend-item strong {
        color: var(--text);
        font-weight: 700;
      }
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: currentColor;
      }
      .kind-stop {
        color: #ef4444;
      }
      .kind-entry,
      .kind-be {
        color: #22d3ee;
      }
      .kind-tp {
        color: #4ade80;
      }
    `,
  ],
})
export class PositionRrTrackerComponent {
  @Input() rrTracker: DeckPositionRrTracker | null | undefined = null;

  markers(): LadderMarker[] {
    const t = this.rrTracker;
    if (!t) return [];
    return t.levels
      .filter((level) => level.kind !== 'be' || level.price !== t.entry)
      .map((level) => ({
        id: level.id,
        label:
          level.kind === 'entry'
            ? 'E'
            : level.kind === 'stop'
              ? 'S'
              : level.kind === 'be'
                ? 'BE'
                : level.label,
        price: level.price,
        tone:
          level.kind === 'entry'
            ? 'entry'
            : level.kind === 'stop'
              ? 'stop'
              : level.kind === 'be'
                ? 'be'
                : 'tp',
        detail: `${level.label} @ ${level.price}`,
      }));
  }

  spotMarker(): LadderMarker | null {
    const t = this.rrTracker;
    if (!t || !Number.isFinite(t.spot)) return null;
    return {
      id: 'spot',
      label: 'Spot',
      price: t.spot,
      tone: 'spot',
      detail: `Spot ${t.spot}`,
    };
  }

  markerLeft(price: number): number {
    const range = this.ladderRange();
    if (!range) return 50;
    const span = range.max - range.min;
    if (span <= 0) return 50;
    return Math.min(96, Math.max(4, ((price - range.min) / span) * 100));
  }

  riskBandStyle(): Record<string, string> {
    const t = this.rrTracker;
    const range = this.ladderRange();
    if (!t || !range) return {};
    const span = range.max - range.min;
    if (span <= 0) return {};
    const low = Math.min(t.entry, t.stopLoss);
    const high = Math.max(t.entry, t.stopLoss);
    return {
      left: `${((low - range.min) / span) * 100}%`,
      width: `${Math.max(2, ((high - low) / span) * 100)}%`,
    };
  }

  profitBandStyle(): Record<string, string> {
    const t = this.rrTracker;
    const range = this.ladderRange();
    if (!t || !range) return {};
    const span = range.max - range.min;
    if (span <= 0) return {};
    const tpPrices = t.levels
      .filter((level) => level.kind === 'tp')
      .map((level) => level.price);
    if (!tpPrices.length) return {};
    const low = Math.min(t.entry, ...tpPrices);
    const high = Math.max(t.entry, ...tpPrices);
    return {
      left: `${((low - range.min) / span) * 100}%`,
      width: `${Math.max(2, ((high - low) / span) * 100)}%`,
    };
  }

  private ladderRange(): { min: number; max: number } | null {
    const t = this.rrTracker;
    if (!t) return null;
    const prices = [
      t.entry,
      t.stopLoss,
      t.spot,
      ...t.levels.map((level) => level.price),
    ].filter((p) => Number.isFinite(p));
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = Math.max(0.5, (max - min) * 0.1);
    return { min: min - pad, max: max + pad };
  }
}