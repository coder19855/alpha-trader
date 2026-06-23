import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DeckTradeSetup } from '../../core/models/deck.models';

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
        @if (setup!.stopAdjustReason) {
          <p class="pa-trade-setup-note">{{ setup!.stopAdjustReason }}</p>
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
}