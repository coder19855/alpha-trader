import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  OptionChainGuardData,
  OptionChainGuardLevel,
} from '../../core/models/option-chain.models';

type OiFlowKind = 'building' | 'unwinding' | 'flat';
type PriceFlowKind = 'rising' | 'falling' | 'flat';

interface RowInsight {
  shortLabel: string;
  flowLabel: string;
  flowIcon: string;
  priceRead: string;
  oiRead: string;
  writerView: string;
  spotImpact: string;
  tone: 'support' | 'resistance' | 'bullish' | 'bearish' | 'neutral';
}

function oiFlowKind(oiChange: number): OiFlowKind {
  if (oiChange > 0) return 'building';
  if (oiChange < 0) return 'unwinding';
  return 'flat';
}

function priceFlowKind(ltpChange: number): PriceFlowKind {
  if (ltpChange > 0.05) return 'rising';
  if (ltpChange < -0.05) return 'falling';
  return 'flat';
}

function writerContext(
  row: OptionChainGuardLevel,
  spotLtp: number,
  oi: OiFlowKind,
): { writerView: string; spotImpact: string; tone: RowInsight['tone'] } {
  const aboveSpot = row.strike > spotLtp;
  const belowSpot = row.strike < spotLtp;
  const atSpot = row.strike === spotLtp;

  if (row.type === 'CE') {
    if (oi === 'building') {
      return {
        writerView:
          'Call writers adding OI — sellers expect price to stay below this strike.',
        spotImpact: aboveSpot
          ? 'Resistance may strengthen above spot.'
          : atSpot
            ? 'ATM call writers active — pinning battle at spot.'
            : 'ITM call writers confident spot holds above strike.',
        tone: 'resistance',
      };
    }
    if (oi === 'unwinding') {
      return {
        writerView: 'Call writers exiting — less fresh supply at this strike.',
        spotImpact: aboveSpot
          ? 'Upside wall may weaken if buyers step in.'
          : 'Call supply reducing — less overhead friction.',
        tone: 'bullish',
      };
    }
    return {
      writerView: 'Little net call OI change today at this strike.',
      spotImpact: 'No fresh writer signal from OI alone.',
      tone: 'neutral',
    };
  }

  if (oi === 'building') {
    return {
      writerView:
        'Put writers adding OI — sellers expect price to stay above this strike.',
      spotImpact: belowSpot
        ? 'Support may strengthen below spot.'
        : atSpot
          ? 'ATM put writers active — defensive positioning at spot.'
          : 'ITM put writers confident spot holds below strike.',
      tone: 'support',
    };
  }
  if (oi === 'unwinding') {
    return {
      writerView: 'Put writers exiting — less hedging supply at this strike.',
      spotImpact: belowSpot
        ? 'Downside cushion may thin if selling resumes.'
        : 'Put supply reducing — less defensive floor.',
      tone: 'bearish',
    };
  }
  return {
    writerView: 'Little net put OI change today at this strike.',
    spotImpact: 'No fresh writer signal from OI alone.',
    tone: 'neutral',
  };
}

function rowInsight(row: OptionChainGuardLevel, spotLtp: number): RowInsight {
  const oi = oiFlowKind(row.oiChange);
  const px = priceFlowKind(row.ltpChange ?? 0);
  const ctx = writerContext(row, spotLtp, oi);

  const priceRead =
    px === 'rising'
      ? 'Premium building up'
      : px === 'falling'
        ? 'Premium fading'
        : 'Premium flat';
  const oiRead =
    oi === 'building'
      ? 'OI building up'
      : oi === 'unwinding'
        ? 'OI winding down'
        : 'OI flat';

  let shortLabel = '';
  let flowIcon = '';
  let flowLabel = '';

  if (oi === 'building' && px === 'rising') {
    shortLabel = 'OI + prem buildup';
    flowIcon = 'north_east';
    flowLabel = 'OI & premium building up';
  } else if (oi === 'building' && px === 'falling') {
    shortLabel = 'OI build · prem fade';
    flowIcon = 'south_east';
    flowLabel = 'OI building · premium fading';
  } else if (oi === 'building') {
    shortLabel = 'OI buildup';
    flowIcon = 'add_chart';
    flowLabel = 'OI building up';
  } else if (oi === 'unwinding' && px === 'rising') {
    shortLabel = 'OI unwind · prem up';
    flowIcon = 'north_west';
    flowLabel = 'OI winding down · premium rising';
  } else if (oi === 'unwinding' && px === 'falling') {
    shortLabel = 'OI + prem unwind';
    flowIcon = 'south_west';
    flowLabel = 'OI & premium winding down';
  } else if (oi === 'unwinding') {
    shortLabel = 'OI unwind';
    flowIcon = 'remove_circle_outline';
    flowLabel = 'OI winding down';
  } else if (px === 'rising') {
    shortLabel = 'Premium buildup';
    flowIcon = 'trending_up';
    flowLabel = 'Premium building up';
  } else if (px === 'falling') {
    shortLabel = 'Premium fade';
    flowIcon = 'trending_down';
    flowLabel = 'Premium fading';
  } else {
    shortLabel = 'Quiet';
    flowIcon = 'horizontal_rule';
    flowLabel = 'OI & premium flat';
  }

  return {
    shortLabel,
    flowLabel,
    flowIcon,
    priceRead,
    oiRead,
    writerView: ctx.writerView,
    spotImpact: ctx.spotImpact,
    tone: ctx.tone,
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
              <span class="call-tag">Call</span> /
              <span class="put-tag">Put</span> = contract type.
              <strong>Price OI Buildup</strong> = OI bar (size) + price bar
              (premium Δ). Flow icon combines both — tap for writer summary.
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
            <span
              class="val"
              [class.bull]="g.pcr < 0.9"
              [class.bear]="g.pcr > 1.1"
            >
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
            <span class="wall-strike">{{
              g.resistanceStrike ?? g.intradayResistance ?? '—'
            }}</span>
            <span class="wall-oi">{{ g.callOiTotal | number }} call OI</span>
          </button>
          <button
            type="button"
            class="wall put"
            [class.active]="focus() === 'pe'"
            (click)="focus.set(focus() === 'pe' ? null : 'pe')"
          >
            <span class="wall-title">Put support</span>
            <span class="wall-strike">{{
              g.supportStrike ?? g.intradaySupport ?? '—'
            }}</span>
            <span class="wall-oi">{{ g.putOiTotal | number }} put OI</span>
          </button>
        </div>

        <div class="ladder-scroll">
          <div class="ladder-head" aria-hidden="true">
            <span>Type</span>
            <span>Strike</span>
            <span class="compact-col">Prem / Δ</span>
            <span class="buildup-head">Price OI Buildup</span>
            <span class="compact-col">OI / Δ</span>
            <span class="flow-head">Flow</span>
          </div>
          <div class="guard-ladder" role="list">
            @for (row of filteredLevels(); track row.strike + row.type) {
              <div
                class="ladder-row"
                role="listitem"
                [class.highlight]="row.strike === g.atmStrike"
              >
                <span
                  class="type-pill"
                  [class.call]="row.type === 'CE'"
                  [class.put]="row.type === 'PE'"
                >
                  {{ row.type === 'CE' ? 'Call' : 'Put' }}
                </span>
                <span class="strike">{{ row.strike }}</span>
                <div class="compact-col prem-stack">
                  <span class="prem">{{ row.ltp | number: '1.1-1' }}</span>
                  <span
                    class="prem-ch"
                    [class.up]="row.ltpChange > 0"
                    [class.down]="row.ltpChange < 0"
                    [class.side]="row.ltpChange === 0"
                  >
                    <mat-icon class="trend-icon">{{
                      flowIcon(row.ltpChange)
                    }}</mat-icon>
                    {{ formatPremChange(row) }}
                  </span>
                </div>
                <div class="buildup-cell">
                  <div class="oi-bar-wrap" title="OI size">
                    <div
                      class="oi-bar"
                      [style.width.%]="row.strength * 100"
                      [class.build]="row.oiChange > 0"
                      [class.unwind]="row.oiChange < 0"
                    ></div>
                  </div>
                  <div class="price-bar-wrap" title="Premium change">
                    <div
                      class="price-bar"
                      [style.width.%]="priceBarWidth(row)"
                      [class.up]="row.ltpChange > 0"
                      [class.down]="row.ltpChange < 0"
                    ></div>
                  </div>
                </div>
                <div class="compact-col oi-stack">
                  <span class="oi">{{ row.oi | number }}</span>
                  <span
                    class="oi-ch"
                    [class.build]="row.oiChange > 0"
                    [class.unwind]="row.oiChange < 0"
                    [class.side]="row.oiChange === 0"
                  >
                    <mat-icon class="trend-icon">{{
                      flowIcon(row.oiChange)
                    }}</mat-icon>
                    {{ row.oiChange > 0 ? '+' : '' }}{{ row.oiChange | number }}
                  </span>
                </div>
                <div class="flow-cell">
                  <span class="flow-label">{{
                    insightFor(row, g).shortLabel
                  }}</span>
                  <button
                    type="button"
                    class="flow-btn"
                    [class]="insightFor(row, g).tone"
                    [attr.aria-label]="insightFor(row, g).flowLabel"
                    (pointerdown)="openDetail($event, row)"
                  >
                    <mat-icon>{{ insightFor(row, g).flowIcon }}</mat-icon>
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      </section>

      @if (selectedRow(); as row) {
        <div
          class="detail-backdrop"
          (pointerdown)="closeDetail()"
          role="presentation"
        ></div>
        <aside
          class="detail-panel"
          role="dialog"
          aria-labelledby="guard-detail-title"
          (pointerdown)="$event.stopPropagation()"
        >
          <header class="detail-head">
            <div>
              <h3 id="guard-detail-title">
                <span
                  class="type-pill"
                  [class.call]="row.type === 'CE'"
                  [class.put]="row.type === 'PE'"
                >
                  {{ row.type === 'CE' ? 'Call' : 'Put' }}
                </span>
                {{ row.strike }}
              </h3>
              <p class="detail-sub">{{ insightFor(row, g).flowLabel }}</p>
            </div>
            <button
              type="button"
              class="detail-close"
              (click)="closeDetail()"
              aria-label="Close"
            >
              <mat-icon>close</mat-icon>
            </button>
          </header>

          <div class="detail-body">
            <div class="flow-chips">
              <span class="chip">
                <mat-icon>{{ insightFor(row, g).flowIcon }}</mat-icon>
                {{ insightFor(row, g).priceRead }}
              </span>
              <span class="chip">
                <mat-icon>{{
                  row.oiChange > 0
                    ? 'add_chart'
                    : row.oiChange < 0
                      ? 'remove_circle_outline'
                      : 'horizontal_rule'
                }}</mat-icon>
                {{ insightFor(row, g).oiRead }}
              </span>
            </div>

            <div class="detail-grid">
              <div class="detail-stat">
                <span class="label">Premium</span>
                <span class="val">₹ {{ row.ltp | number: '1.2-2' }}</span>
                <span
                  class="sub"
                  [class.up]="row.ltpChange > 0"
                  [class.down]="row.ltpChange < 0"
                >
                  {{ formatPremChange(row) }}
                </span>
              </div>
              <div class="detail-stat">
                <span class="label">Open interest</span>
                <span class="val">{{ row.oi | number }}</span>
                <span
                  class="sub"
                  [class.build]="row.oiChange > 0"
                  [class.unwind]="row.oiChange < 0"
                >
                  OI Δ {{ row.oiChange > 0 ? '+' : ''
                  }}{{ row.oiChange | number }}
                </span>
              </div>
              <div class="detail-stat">
                <span class="label">IV</span>
                <span class="val">{{
                  row.iv !== null ? (row.iv | number: '1.1-1') + '%' : '—'
                }}</span>
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
      }
      .call-tag {
        color: var(--oc-call, #38bdf8);
        font-weight: 700;
      }
      .put-tag {
        color: var(--oc-put, #c4b5fd);
        font-weight: 700;
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
      .stat .val.bull {
        color: #4ade80;
      }
      .stat .val.bear {
        color: #f87171;
      }
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
      .wall.call {
        border-color: var(--oc-call-border, rgba(56, 189, 248, 0.4));
      }
      .wall.put {
        border-color: var(--oc-put-border, rgba(196, 181, 253, 0.4));
      }
      .wall.active {
        box-shadow: 0 0 0 1px currentColor inset;
      }
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
      .wall-oi {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .ladder-scroll {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .ladder-head,
      .ladder-row {
        display: grid;
        grid-template-columns: 40px 44px 72px minmax(88px, 1fr) 72px minmax(
            108px,
            1.1fr
          );
        gap: 6px;
        align-items: center;
        min-width: 380px;
      }
      .ladder-head {
        font-size: 0.58rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        margin-bottom: 4px;
      }
      .ladder-head .flow-head,
      .ladder-head .buildup-head {
        text-align: right;
      }
      .compact-col {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .prem-stack .prem,
      .oi-stack .oi {
        font-weight: 600;
      }
      .buildup-cell {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .price-bar-wrap {
        height: 6px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 3px;
        overflow: hidden;
      }
      .price-bar {
        height: 100%;
        border-radius: 3px;
        min-width: 2px;
        background: #a78bfa;
      }
      .price-bar.up {
        background: #4ade80;
      }
      .price-bar.down {
        background: #f87171;
      }
      .guard-ladder {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ladder-row {
        font-size: 0.68rem;
        padding: 4px 0;
      }
      .ladder-row.highlight {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 6px;
      }
      .type-pill {
        display: inline-block;
        font-size: 0.56rem;
        font-weight: 700;
        padding: 2px 4px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .type-pill.call {
        color: var(--oc-call, #38bdf8);
        background: var(--oc-call-soft, rgba(56, 189, 248, 0.12));
        border: 1px solid var(--oc-call-border, rgba(56, 189, 248, 0.35));
      }
      .type-pill.put {
        color: var(--oc-put, #c4b5fd);
        background: var(--oc-put-soft, rgba(196, 181, 253, 0.12));
        border: 1px solid var(--oc-put-border, rgba(196, 181, 253, 0.35));
      }
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
      .oi-bar.build {
        background: #22d3ee;
      }
      .oi-bar.unwind {
        background: #fb923c;
      }
      .prem-ch,
      .oi-ch {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .prem-ch.up,
      .sub.up {
        color: #4ade80;
      }
      .prem-ch.down,
      .sub.down {
        color: #f87171;
      }
      .prem-ch.side,
      .sub.side {
        color: #9ca3af;
      }
      .oi-ch.build,
      .sub.build {
        color: #22d3ee;
      }
      .oi-ch.unwind,
      .sub.unwind {
        color: #fb923c;
      }
      .oi-ch.side {
        color: #9ca3af;
      }
      .trend-icon {
        font-size: 13px;
        width: 13px;
        height: 13px;
        flex-shrink: 0;
      }
      .flow-cell {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        min-width: 0;
      }
      @media (max-width: 520px) {
        .ladder-head,
        .ladder-row {
          grid-template-columns: 34px 40px 68px 1fr 68px 84px;
          min-width: 320px;
        }
        .flow-label {
          display: none;
        }
        .flow-btn {
          width: 30px;
          height: 30px;
        }
      }
      .flow-label {
        font-size: 0.58rem;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
        text-align: right;
      }
      .flow-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        flex-shrink: 0;
        padding: 0;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: rgba(0, 0, 0, 0.25);
        color: var(--muted);
        cursor: pointer;
      }
      .flow-btn mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
      }
      .flow-btn.resistance {
        color: #fb923c;
        border-color: rgba(251, 146, 60, 0.4);
      }
      .flow-btn.support {
        color: var(--oc-call, #38bdf8);
        border-color: var(--oc-call-border, rgba(56, 189, 248, 0.4));
      }
      .flow-btn.bullish {
        color: #4ade80;
        border-color: rgba(74, 222, 128, 0.35);
      }
      .flow-btn.bearish {
        color: #f87171;
        border-color: rgba(248, 113, 113, 0.35);
      }
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
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
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
      .flow-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.68rem;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .chip mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: #22d3ee;
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
    return levels.filter((l) =>
      f === 'ce' ? l.type === 'CE' : l.type === 'PE',
    );
  });

  insightFor(row: OptionChainGuardLevel, g: OptionChainGuardData): RowInsight {
    return rowInsight(row, g.spotLtp);
  }

  flowIcon(change: number): string {
    if (change > 0) return 'trending_up';
    if (change < 0) return 'trending_down';
    return 'horizontal_rule';
  }

  priceBarWidth(row: OptionChainGuardLevel): number {
    const pct = Math.abs(row.ltpChangePct ?? 0);
    return Math.min(100, Math.max(8, pct * 4));
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

  openDetail(event: PointerEvent, row: OptionChainGuardLevel): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedRow.set(row);
  }

  closeDetail(): void {
    this.selectedRow.set(null);
  }
}
