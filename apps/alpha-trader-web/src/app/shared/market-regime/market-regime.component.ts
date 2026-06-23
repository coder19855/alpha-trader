import { Component, Input } from '@angular/core';
import { DeckMarketRegime } from '../../core/models/deck.models';

@Component({
  selector: 'app-market-regime',
  standalone: true,
  template: `
    @if (regime?.kind) {
      <div
        class="market-regime"
        [class.trending-up]="regimeClass() === 'trending-up'"
        [class.trending-down]="regimeClass() === 'trending-down'"
        [class.sideways]="regimeClass() === 'sideways'"
        [class.transitional]="regimeClass() === 'transitional'"
        [class.confirming]="regime!.confirming"
        role="status"
        aria-live="polite"
      >
        <span class="market-regime-arrow" aria-hidden="true">{{ displayArrow() }}</span>
        <span class="market-regime-text">
          <span class="market-regime-label">{{ regime!.label }}</span>
          @if (regime!.confirming && regime!.rawKind !== regime!.kind) {
            <span class="market-regime-confirm">confirming {{ regime!.rawKind }}…</span>
          }
        </span>
        <span class="market-regime-hint">
          {{ regime!.hint }}
          @if (regime!.pollsInRegime && regime!.pollsInRegime > 1) {
            <span class="market-regime-polls"> · {{ regime!.pollsInRegime }} polls</span>
          }
        </span>
      </div>
    }
  `,
})
export class MarketRegimeComponent {
  @Input() regime: DeckMarketRegime | null | undefined;

  regimeClass(): string {
    const regime = this.regime;
    if (!regime) return '';
    if (regime.kind === 'sideways') return 'sideways';
    if (regime.kind === 'transitional') return 'transitional';
    if (regime.direction === 'down') return 'trending-down';
    return 'trending-up';
  }

  displayArrow(): string {
    const regime = this.regime;
    if (!regime) return '';
    if (regime.kind === 'sideways' || regime.kind === 'transitional') return '↔';
    return regime.arrow;
  }
}