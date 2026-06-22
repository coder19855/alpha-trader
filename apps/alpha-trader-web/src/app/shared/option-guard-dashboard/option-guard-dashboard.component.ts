import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { OptionChainGuardData } from '../../core/models/option-chain.models';

@Component({
  selector: 'app-option-guard-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (guard(); as g) {
      <section class="guard-panel">
        <div class="guard-head">
          <span>OI Guard</span>
          <span class="guard-sub">Interactive strike walls near spot</span>
        </div>

        <div class="guard-stats">
          <div class="stat">
            <span class="label">Spot</span>
            <span class="val">{{ g.spotLtp | number: '1.0-0' }}</span>
          </div>
          <div class="stat">
            <span class="label">ATM</span>
            <span class="val">{{ g.atmStrike }}</span>
          </div>
          <div class="stat">
            <span class="label">Max pain</span>
            <span class="val">{{ g.maxPain }}</span>
          </div>
          <div class="stat">
            <span class="label">PCR</span>
            <span class="val" [class.bull]="g.pcr < 0.9" [class.bear]="g.pcr > 1.1">
              {{ g.pcr | number: '1.2-2' }}
            </span>
          </div>
          <div class="stat">
            <span class="label">VIX</span>
            <span class="val">{{ g.indiaVix | number: '1.1-1' }}</span>
          </div>
        </div>

        <div class="guard-walls">
          <button
            type="button"
            class="wall ce"
            [class.active]="focus() === 'ce'"
            (click)="focus.set(focus() === 'ce' ? null : 'ce')"
          >
            <span class="wall-title">Call wall</span>
            <span class="wall-strike">{{ g.resistanceStrike ?? g.intradayResistance ?? '—' }}</span>
            <span class="wall-oi">{{ g.callOiTotal | number }} OI</span>
          </button>
          <button
            type="button"
            class="wall pe"
            [class.active]="focus() === 'pe'"
            (click)="focus.set(focus() === 'pe' ? null : 'pe')"
          >
            <span class="wall-title">Put wall</span>
            <span class="wall-strike">{{ g.supportStrike ?? g.intradaySupport ?? '—' }}</span>
            <span class="wall-oi">{{ g.putOiTotal | number }} OI</span>
          </button>
        </div>

        <div class="guard-ladder" role="list">
          @for (row of filteredLevels(); track row.strike + row.type) {
            <div
              class="ladder-row"
              role="listitem"
              [class.ce]="row.type === 'CE'"
              [class.pe]="row.type === 'PE'"
              [class.highlight]="row.strike === g.atmStrike"
            >
              <span class="type">{{ row.type }}</span>
              <span class="strike">{{ row.strike }}</span>
              <div class="oi-bar-wrap">
                <div
                  class="oi-bar"
                  [style.width.%]="row.strength * 100"
                  [class.build]="row.oiChange > 0"
                  [class.unwind]="row.oiChange < 0"
                ></div>
              </div>
              <span class="oi">{{ row.oi | number }}</span>
              <span class="ch" [class.up]="row.oiChange > 0" [class.down]="row.oiChange < 0">
                {{ row.oiChange > 0 ? '+' : '' }}{{ row.oiChange | number }}
              </span>
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: [
    `
      .guard-panel {
        margin-top: 12px;
        padding: 12px;
        border-radius: 10px;
        border: 1px solid rgba(167, 139, 250, 0.25);
        background: rgba(167, 139, 250, 0.05);
      }
      .guard-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 10px;
        font-weight: 700;
        font-size: 0.82rem;
      }
      .guard-sub {
        font-size: 0.65rem;
        color: var(--muted);
        font-weight: 500;
      }
      .guard-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 16px;
        margin-bottom: 12px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 64px;
      }
      .stat .label {
        font-size: 0.62rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .stat .val {
        font-size: 0.88rem;
        font-weight: 700;
      }
      .stat .val.bull { color: #4ade80; }
      .stat .val.bear { color: #f87171; }
      .guard-walls {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }
      .wall {
        border-radius: 8px;
        border: 1px solid var(--border);
        background: rgba(0, 0, 0, 0.2);
        padding: 8px 10px;
        text-align: left;
        cursor: pointer;
        color: inherit;
      }
      .wall.ce { border-color: rgba(74, 222, 128, 0.35); }
      .wall.pe { border-color: rgba(248, 113, 113, 0.35); }
      .wall.active { box-shadow: 0 0 0 1px currentColor inset; }
      .wall-title {
        display: block;
        font-size: 0.62rem;
        color: var(--muted);
        text-transform: uppercase;
      }
      .wall-strike {
        display: block;
        font-size: 1rem;
        font-weight: 700;
      }
      .wall-oi {
        display: block;
        font-size: 0.68rem;
        color: var(--muted);
      }
      .guard-ladder {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ladder-row {
        display: grid;
        grid-template-columns: 28px 52px 1fr 64px 48px;
        gap: 8px;
        align-items: center;
        font-size: 0.72rem;
        padding: 4px 0;
      }
      .ladder-row.highlight {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 6px;
      }
      .ladder-row .type {
        font-weight: 700;
        font-size: 0.65rem;
      }
      .ladder-row.ce .type { color: #4ade80; }
      .ladder-row.pe .type { color: #f87171; }
      .oi-bar-wrap {
        height: 8px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        overflow: hidden;
      }
      .oi-bar {
        height: 100%;
        border-radius: 4px;
        background: #a78bfa;
        min-width: 2px;
      }
      .oi-bar.build { background: #22d3ee; }
      .oi-bar.unwind { background: #fb923c; }
      .ch.up { color: #4ade80; }
      .ch.down { color: #f87171; }
    `,
  ],
})
export class OptionGuardDashboardComponent {
  readonly guard = signal<OptionChainGuardData | null>(null);
  readonly focus = signal<'ce' | 'pe' | null>(null);

  @Input({ required: true })
  set guardData(value: OptionChainGuardData | null | undefined) {
    this.guard.set(value ?? null);
  }

  readonly filteredLevels = computed(() => {
    const g = this.guard();
    const f = this.focus();
    if (!g) return [];
    const levels = g.levels ?? [];
    if (!f) return levels;
    return levels.filter((l) => (f === 'ce' ? l.type === 'CE' : l.type === 'PE'));
  });
}