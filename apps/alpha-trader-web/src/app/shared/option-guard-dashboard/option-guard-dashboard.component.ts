import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  OptionChainGuardData,
  OptionChainGuardLevel,
} from '../../core/models/option-chain.models';

type OiFlowKind = 'building' | 'unwinding' | 'flat';

interface RowInsight {
  flowKind: OiFlowKind;
  flowLabel: string;
  flowIcon: string;
  writerView: string;
  spotImpact: string;
  tone: 'support' | 'resistance' | 'bullish' | 'bearish' | 'neutral';
}

function oiFlowKind(oiChange: number): OiFlowKind {
  if (oiChange > 0) return 'building';
  if (oiChange < 0) return 'unwinding';
  return 'flat';
}

function rowInsight(
  row: OptionChainGuardLevel,
  spotLtp: number,
): RowInsight {
  const flow = oiFlowKind(row.oiChange);
  const aboveSpot = row.strike > spotLtp;
  const belowSpot = row.strike < spotLtp;
  const atSpot = row.strike === spotLtp;

  if (row.type === 'CE') {
    if (flow === 'building') {
      return {
        flowKind: flow,
        flowLabel: 'Call OI building',
        flowIcon: 'add_chart',
        writerView:
          'Call writers are adding fresh open interest — sellers expect price to stay below this strike.',
        spotImpact: aboveSpot
          ? 'Resistance may strengthen above spot — upside can slow near this strike.'
          : atSpot
            ? 'ATM call writers active — pinning / theta battle at spot.'
            : 'ITM call OI building — writers confident spot holds above strike.',
        tone: 'resistance',
      };
    }
    if (flow === 'unwinding') {
      return {
        flowKind: flow,
        flowLabel: 'Call OI unwinding',
        flowIcon: 'trending_down',
        writerView: 'Call writers are exiting — less fresh supply at this strike.',
        spotImpact: aboveSpot
          ? 'Upside wall may weaken — easier for spot to push through if buyers step in.'
          : 'Call supply reducing — less overhead friction from writers.',
        tone: 'bullish',
      };
    }
    return {
      flowKind: flow,
      flowLabel: 'Call OI flat',
      flowIcon: 'horizontal_rule',
      writerView: 'Little net change in call open interest today at this strike.',
      spotImpact: 'No fresh writer positioning signal from OI alone.',
      tone: 'neutral',
    };
  }

  // PE
  if (flow === 'building') {
    return {
      flowKind: flow,
      flowLabel: 'Put OI building',
      flowIcon: 'add_chart',
      writerView:
        'Put writers are adding fresh open interest — sellers expect price to stay above this strike.',
      spotImpact: belowSpot
        ? 'Support may strengthen below spot — downside may slow near this strike.'
        : atSpot
          ? 'ATM put writers active — defensive positioning at spot.'
          : 'ITM put OI building — writers confident spot holds below strike.',
      tone: 'support',
    };
  }
  if (flow === 'unwinding') {
    return {
      flowKind: flow,
      flowLabel: 'Put OI unwinding',
      flowIcon: 'trending_up',
      writerView: 'Put writers are exiting — less hedging supply at this strike.',
      spotImpact: belowSpot
        ? 'Downside cushion may thin — easier for spot to slip if selling resumes.'
        : 'Put supply reducing — less defensive floor from writers.',
      tone: 'bearish',
    };
  }
  return {
    flowKind: flow,
    flowLabel: 'Put OI flat',
    flowIcon: 'horizontal_rule',
    writerView: 'Little net change in put open interest today at this strike.',
    spotImpact: 'No fresh writer positioning signal from OI alone.',
    tone: 'neutral',
  };
}

@Component({
  selector: 'app-option-guard-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (guard(); as g) {
      <section class="guard-panel">
        <div class="guard-head">
          <div>
            <span>OI Guard</span>
            <p class="guard-legend">
              <strong>Call</strong> / <strong>Put</strong> colours are contract type only — not
              bullish or bearish. Flow icons read from the <em>writer</em> side (OI build =
              new sellers).
            </p>
          </div>
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
            class="wall call"
            [class.active]="focus() === 'ce'"
            (click)="focus.set(focus() === 'ce' ? null : 'ce')"
          >
            <span class="wall-title">Call resistance</span>
            <span class="wall-strike">{{ g.resistanceStrike ?? g.intradayResistance ?? '—' }}</span>
            <span class="wall-oi">{{ g.callOiTotal | number }} call OI</span>
          </button>
          <button
            type="button"
            class="wall put"
            [class.active]="focus() === 'pe'"
            (click)="focus.set(focus() === 'pe' ? null : 'pe')"
          >
            <span class="wall-title">Put support</span>
            <span class="wall-strike">{{ g.supportStrike ?? g.intradaySupport ?? '—' }}</span>
            <span class="wall-oi">{{ g.putOiTotal | number }} put OI</span>
          </button>
        </div>

        <div class="ladder-scroll">
          <div class="ladder-head" aria-hidden="true">
            <span>Type</span>
            <span>Strike</span>
            <span>Prem</span>
            <span>Prem Δ</span>
            <span>OI</span>
            <span>OI Δ</span>
            <span></span>
          </div>
          <div class="guard-ladder" role="list">
            @for (row of filteredLevels(); track row.strike + row.type) {
              <div
                class="ladder-row"
                role="listitem"
                [class.call-row]="row.type === 'CE'"
                [class.put-row]="row.type === 'PE'"
                [class.highlight]="row.strike === g.atmStrike"
              >
                <span class="type-pill" [class.call]="row.type === 'CE'" [class.put]="row.type === 'PE'">
                  {{ row.type === 'CE' ? 'Call' : 'Put' }}
                </span>
                <span class="strike">{{ row.strike }}</span>
                <span class="prem">{{ row.ltp | number: '1.1-1' }}</span>
                <span
                  class="prem-ch"
                  [class.up]="row.ltpChange > 0"
                  [class.down]="row.ltpChange < 0"
                >
                  {{ formatPremChange(row) }}
                </span>
                <span class="oi">{{ row.oi | number }}</span>
                <span
                  class="oi-ch"
                  [class.build]="row.oiChange > 0"
                  [class.unwind]="row.oiChange < 0"
                >
                  {{ row.oiChange > 0 ? '+' : '' }}{{ row.oiChange | number }}
                </span>
                <button
                  type="button"
                  class="flow-btn"
                  [class]="insightFor(row, g).tone"
                  [attr.aria-label]="'OI flow: ' + insightFor(row, g).flowLabel"
                  (click)="openDetail(row)"
                >
                  <mat-icon>{{ insightFor(row, g).flowIcon }}</mat-icon>
                </button>
              </div>
            }
          </div>
        </div>
      </section>

      @if (selectedRow(); as row) {
        <div class="detail-backdrop" (click)="closeDetail()" role="presentation"></div>
        <aside class="detail-panel" role="dialog" aria-labelledby="guard-detail-title">
          <header class="detail-head">
            <div>
              <h3 id="guard-detail-title">
                <span class="type-pill" [class.call]="row.type === 'CE'" [class.put]="row.type === 'PE'">
                  {{ row.type === 'CE' ? 'Call' : 'Put' }}
                </span>
                {{ row.strike }}
              </h3>
              <p class="detail-sub">{{ insightFor(row, g).flowLabel }}</p>
            </div>
            <button type="button" class="detail-close" (click)="closeDetail()" aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </header>

          <div class="detail-body">
            <div class="detail-grid">
              <div class="detail-stat">
                <span class="label">Premium</span>
                <span class="val">₹ {{ row.ltp | number: '1.2-2' }}</span>
                <span class="sub" [class.up]="row.ltpChange > 0" [class.down]="row.ltpChange < 0">
                  {{ formatPremChange(row) }}
                </span>
              </div>
              <div class="detail-stat">
                <span class="label">Open interest</span>
                <span class="val">{{ row.oi | number }}</span>
                <span class="sub" [class.build]="row.oiChange > 0" [class.unwind]="row.oiChange < 0">
                  OI Δ {{ row.oiChange > 0 ? '+' : '' }}{{ row.oiChange | number }}
                </span>
              </div>
              <div class="detail-stat">
                <span class="label">IV</span>
                <span class="val">{{ row.iv != null ? (row.iv | number: '1.1-1') + '%' : '—' }}</span>
              </div>
              <div class="detail-stat">
                <span class="label">vs spot</span>
                <span class="val">{{ spotDistance(row, g) }}</span>
              </div>
            </div>

            <section class="detail-section">
              <h4>Writer view</h4>
              <p>{{ insightFor(row, g).writerView }}</p>
            </section>
            <section class="detail-section">
              <h4>Spot impact</h4>
              <p>{{ insightFor(row, g).spotImpact }}</p>
            </section>
            <p class="detail-note">
              CE/PE labels describe the contract — not a buy/sell signal. OI build = new writers;
              OI unwind = writers exiting. Combine with PA and the flow gauge before trading.
            </p>
          </div>
        </aside>
      }
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
        margin-bottom: 10px;
        font-weight: 700;
        font-size: 0.82rem;
      }
      .guard-legend {
        margin: 4px 0 0;
        font-size: 0.65rem;
        color: var(--muted);
        font-weight: 400;
        line-height: 1.4;
        max-width: 52rem;
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
      .wall.call { border-color: rgba(56, 189, 248, 0.4); }
      .wall.put { border-color: rgba(196, 181, 253, 0.4); }
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
      .ladder-scroll {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .ladder-head,
      .ladder-row {
        display: grid;
        grid-template-columns: 44px 48px 44px 56px 56px 52px 32px;
        gap: 6px;
        align-items: center;
        min-width: 340px;
      }
      .ladder-head {
        font-size: 0.58rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 0 0 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        margin-bottom: 4px;
      }
      .guard-ladder {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ladder-row {
        font-size: 0.7rem;
        padding: 4px 0;
      }
      .ladder-row.highlight {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 6px;
      }
      .type-pill {
        display: inline-block;
        font-size: 0.58rem;
        font-weight: 700;
        padding: 2px 5px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .type-pill.call {
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.35);
      }
      .type-pill.put {
        color: #c4b5fd;
        background: rgba(196, 181, 253, 0.12);
        border: 1px solid rgba(196, 181, 253, 0.35);
      }
      .prem-ch.up, .sub.up { color: #4ade80; }
      .prem-ch.down, .sub.down { color: #f87171; }
      .oi-ch.build, .sub.build { color: #22d3ee; }
      .oi-ch.unwind, .sub.unwind { color: #fb923c; }
      .flow-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: rgba(0, 0, 0, 0.25);
        color: var(--muted);
        cursor: pointer;
      }
      .flow-btn mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .flow-btn.resistance { color: #fb923c; border-color: rgba(251, 146, 60, 0.4); }
      .flow-btn.support { color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); }
      .flow-btn.bullish { color: #4ade80; border-color: rgba(74, 222, 128, 0.35); }
      .flow-btn.bearish { color: #f87171; border-color: rgba(248, 113, 113, 0.35); }
      .detail-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 1200;
      }
      .detail-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(360px, 92vw);
        z-index: 1201;
        background: #11151c;
        border-left: 1px solid var(--border);
        box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        animation: slide-in 0.2s ease-out;
      }
      @keyframes slide-in {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }
      .detail-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 14px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .detail-head h3 {
        margin: 0;
        font-size: 1rem;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .detail-sub {
        margin: 4px 0 0;
        font-size: 0.72rem;
        color: #22d3ee;
        font-weight: 600;
      }
      .detail-close {
        background: transparent;
        border: none;
        color: var(--muted);
        cursor: pointer;
        padding: 4px;
      }
      .detail-body {
        padding: 12px 14px 20px;
        overflow-y: auto;
        flex: 1;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 14px;
      }
      .detail-stat {
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      .detail-stat .label {
        display: block;
        font-size: 0.6rem;
        color: var(--muted);
        text-transform: uppercase;
      }
      .detail-stat .val {
        display: block;
        font-size: 0.95rem;
        font-weight: 700;
        margin-top: 2px;
      }
      .detail-stat .sub {
        display: block;
        font-size: 0.68rem;
        margin-top: 2px;
        color: var(--muted);
      }
      .detail-section h4 {
        margin: 0 0 6px;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
      }
      .detail-section p {
        margin: 0 0 12px;
        font-size: 0.78rem;
        line-height: 1.45;
        color: #e8ecf1;
      }
      .detail-note {
        font-size: 0.65rem;
        color: var(--muted);
        line-height: 1.4;
        margin: 8px 0 0;
        font-style: italic;
      }
    `,
  ],
})
export class OptionGuardDashboardComponent {
  readonly guard = signal<OptionChainGuardData | null>(null);
  readonly focus = signal<'ce' | 'pe' | null>(null);
  readonly selectedRow = signal<OptionChainGuardLevel | null>(null);

  @Input({ required: true })
  set guardData(value: OptionChainGuardData | null | undefined) {
    this.guard.set(value ?? null);
    this.selectedRow.set(null);
  }

  readonly filteredLevels = computed(() => {
    const g = this.guard();
    const f = this.focus();
    if (!g) return [];
    const levels = g.levels ?? [];
    if (!f) return levels;
    return levels.filter((l) => (f === 'ce' ? l.type === 'CE' : l.type === 'PE'));
  });

  insightFor(row: OptionChainGuardLevel, g: OptionChainGuardData): RowInsight {
    return rowInsight(row, g.spotLtp);
  }

  formatPremChange(row: OptionChainGuardLevel): string {
    const ch = row.ltpChange ?? 0;
    const pct = row.ltpChangePct ?? 0;
    if (ch === 0 && pct === 0) return '—';
    const sign = ch >= 0 ? '+' : '';
    return `${sign}${ch.toFixed(1)} (${sign}${pct.toFixed(1)}%)`;
  }

  spotDistance(row: OptionChainGuardLevel, g: OptionChainGuardData): string {
    const d = row.strike - g.spotLtp;
    if (d === 0) return 'At spot';
    return d > 0 ? `${d} pts above` : `${Math.abs(d)} pts below`;
  }

  openDetail(row: OptionChainGuardLevel): void {
    this.selectedRow.set(row);
  }

  closeDetail(): void {
    this.selectedRow.set(null);
  }
}