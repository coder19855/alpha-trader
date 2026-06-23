import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DeckTradeSetup } from '../../core/models/deck.models';

interface LadderMarker {
  id: string;
  label: string;
  price: number;
  tone: 'entry' | 'stop' | 'tp' | 'neutral';
  detail?: string;
}

@Component({
  selector: 'app-pa-trade-setup',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    @if (hasSetup()) {
      <section class="pa-insight-card pa-trade-setup" aria-label="Trade setup">
        <div class="pa-insight-card-head">
          <span class="pa-insight-card-title">Trade setup</span>
          @if (setup!.stopAdjusted) {
            <span class="pa-trade-setup-tag">ATR adjusted</span>
          }
        </div>
        <div class="pa-trade-setup-grid">
          <div class="pa-trade-setup-stat">
            <span class="pa-trade-setup-label">Entry</span>
            <span class="pa-trade-setup-value">{{ setup!.entry | number: '1.2-2' }}</span>
          </div>
          <div class="pa-trade-setup-stat">
            <span class="pa-trade-setup-label">Stop</span>
            <span class="pa-trade-setup-value tone-negative">
              {{ setup!.stopLoss | number: '1.2-2' }}
            </span>
          </div>
          <div class="pa-trade-setup-stat">
            <span class="pa-trade-setup-label">Risk</span>
            <span class="pa-trade-setup-value">{{ setup!.risk | number: '1.2-2' }} pts</span>
          </div>
          <div class="pa-trade-setup-stat">
            <span class="pa-trade-setup-label">ATR</span>
            <span class="pa-trade-setup-value">{{ setup!.atrUsed | number: '1.2-2' }}</span>
          </div>
        </div>
        @if (ladderMarkers().length) {
          <div class="pa-trade-setup-ladder" aria-hidden="true">
            <div class="pa-trade-setup-ladder-track">
              @for (marker of ladderMarkers(); track marker.id) {
                <div
                  class="pa-trade-setup-ladder-marker"
                  [class]="'tone-' + marker.tone"
                  [style.left.%]="markerLeft(marker.price)"
                  [attr.title]="marker.detail || marker.label"
                >
                  <span class="pa-trade-setup-ladder-tick"></span>
                  <span class="pa-trade-setup-ladder-label">{{ marker.label }}</span>
                </div>
              }
            </div>
            <div class="pa-trade-setup-ladder-risk" [style]="riskBandStyle()"></div>
          </div>
        }
        @if (setup!.takeProfits.length) {
          <div class="pa-trade-setup-tps">
            @for (tp of setup!.takeProfits; track tp.rr) {
              <span class="pa-trade-setup-tp">
                <span class="pa-trade-setup-tp-rr">{{ tp.rr }}</span>
                <span class="pa-trade-setup-tp-price">{{ tp.price | number: '1.2-2' }}</span>
              </span>
            }
          </div>
        }
      </section>
    } @else if (showEmpty) {
      <section class="pa-insight-card pa-trade-setup muted-card" aria-label="Trade setup">
        <span class="pa-insight-card-title">Trade setup</span>
        <p class="pa-trade-setup-empty">No directional setup — wait for CE/PE entry signal.</p>
      </section>
    }
  `,
})
export class PaTradeSetupComponent {
  @Input() setup: DeckTradeSetup | null | undefined;
  @Input() showEmpty = true;

  hasSetup(): boolean {
    const setup = this.setup;
    return Boolean(
      setup &&
        Number.isFinite(setup.entry) &&
        Number.isFinite(setup.stopLoss) &&
        setup.risk > 0,
    );
  }

  ladderMarkers(): LadderMarker[] {
    const setup = this.setup;
    if (!this.hasSetup() || !setup) return [];
    const markers: LadderMarker[] = [
      {
        id: 'entry',
        label: 'E',
        price: setup.entry,
        tone: 'entry',
        detail: `Entry ${setup.entry}`,
      },
      {
        id: 'stop',
        label: 'S',
        price: setup.stopLoss,
        tone: 'stop',
        detail: `Stop ${setup.stopLoss}`,
      },
    ];
    setup.takeProfits.forEach((tp, index) => {
      markers.push({
        id: `tp-${index}`,
        label: tp.rr,
        price: tp.price,
        tone: 'tp',
        detail: `${tp.rr} @ ${tp.price}`,
      });
    });
    return markers;
  }

  markerLeft(price: number): number {
    const range = this.ladderRange();
    if (!range) return 50;
    const span = range.max - range.min;
    if (span <= 0) return 50;
    return Math.min(96, Math.max(4, ((price - range.min) / span) * 100));
  }

  riskBandStyle(): Record<string, string> {
    const setup = this.setup;
    const range = this.ladderRange();
    if (!setup || !range) return {};
    const span = range.max - range.min;
    if (span <= 0) return {};
    const low = Math.min(setup.entry, setup.stopLoss);
    const high = Math.max(setup.entry, setup.stopLoss);
    const left = ((low - range.min) / span) * 100;
    const width = ((high - low) / span) * 100;
    return {
      left: `${left}%`,
      width: `${Math.max(2, width)}%`,
    };
  }

  private ladderRange(): { min: number; max: number } | null {
    const setup = this.setup;
    if (!setup) return null;
    const prices = [
      setup.entry,
      setup.stopLoss,
      ...setup.takeProfits.map((tp) => tp.price),
    ].filter((p) => Number.isFinite(p));
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = Math.max(0.5, (max - min) * 0.08);
    return { min: min - pad, max: max + pad };
  }
}