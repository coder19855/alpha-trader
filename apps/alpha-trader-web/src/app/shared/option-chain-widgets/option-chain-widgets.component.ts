import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import {
  OptionChainAtmGreeks,
  OptionChainSignalPayload,
} from '../../core/models/option-chain.models';

@Component({
  selector: 'app-option-chain-widgets',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (payload(); as oc) {
      <section class="widgets-grid">
        <!-- OI balance -->
        <article class="widget oi-balance">
          <header class="widget-head">
            <span>OI balance</span>
            <span class="widget-sub">PCR {{ oc.guard.pcr | number: '1.2-2' }}</span>
          </header>
          <div class="oi-bar-track">
            <div
              class="oi-seg calls"
              [style.width.%]="callOiShare()"
              title="Call OI"
            ></div>
            <div
              class="oi-seg puts"
              [style.width.%]="putOiShare()"
              title="Put OI"
            ></div>
          </div>
          <div class="oi-labels">
            <span class="ce">CE {{ oc.guard.callOiTotal | number }}</span>
            <span class="pe">PE {{ oc.guard.putOiTotal | number }}</span>
          </div>
        </article>

        <!-- IV skew + VIX -->
        <article class="widget skew-vix">
          <header class="widget-head"><span>Volatility</span></header>
          <div class="skew-row">
            <span class="skew-label">IV skew</span>
            <span
              class="skew-val"
              [class.bear]="(oc.atmGreeks?.ivSkew ?? 0) > 0.5"
              [class.bull]="(oc.atmGreeks?.ivSkew ?? 0) < -0.5"
            >
              {{ formatSkew(oc.atmGreeks?.ivSkew) }}
            </span>
          </div>
          <div class="skew-meter">
            <div class="skew-mid"></div>
            <div
              class="skew-fill"
              [style.width.%]="skewMeterWidth(oc.atmGreeks?.ivSkew)"
              [class.left]="(oc.atmGreeks?.ivSkew ?? 0) < 0"
            ></div>
          </div>
          <div class="vix-chip">
            <span class="vix-label">India VIX</span>
            <span class="vix-val">{{ oc.guard.indiaVix | number: '1.1-1' }}</span>
            <span class="vix-hint">{{ vixHint(oc.guard.indiaVix) }}</span>
          </div>
        </article>

        <!-- Max pain distance -->
        <article class="widget pain-widget">
          <header class="widget-head"><span>Max pain</span></header>
          <div class="pain-visual">
            <span class="pain-strike">{{ oc.guard.maxPain }}</span>
            <span class="pain-dist" [class.above]="painDist() > 0" [class.below]="painDist() < 0">
              Spot {{ painDist() >= 0 ? '+' : '' }}{{ painDist() | number: '1.0-0' }} pts
            </span>
          </div>
          <p class="pain-hint">
            {{ painDist() > 20 ? 'Spot above pain — mild pull-down bias' : painDist() < -20 ? 'Spot below pain — mild pull-up bias' : 'Near max pain — pinning zone' }}
          </p>
        </article>
      </section>

      @if (oc.atmGreeks; as greeks) {
        <section class="greeks-panel">
          <header class="greeks-head">
            <span>ATM Greeks</span>
            <span class="greeks-strike">Strike {{ greeks.atmStrike }}</span>
          </header>
          <div class="greeks-cards">
            @for (leg of greekLegs(greeks); track leg.side) {
              <article class="greek-card" [class.ce]="leg.side === 'CE'" [class.pe]="leg.side === 'PE'">
                <div class="greek-card-head">
                  <span class="side">{{ leg.side }}</span>
                  <span class="premium">₹{{ leg.ltp | number: '1.1-1' }}</span>
                </div>
                @if (leg.snapshot) {
                  <div class="greek-grid">
                    @for (row of greekRows(leg.snapshot); track row.key) {
                      <div class="greek-row">
                        <span class="greek-key">{{ row.key }}</span>
                        <div class="greek-bar-wrap">
                          <div
                            class="greek-bar"
                            [style.width.%]="row.bar"
                            [class.neg]="row.value < 0"
                          ></div>
                        </div>
                        <span class="greek-val">{{ row.display }}</span>
                      </div>
                    }
                  </div>
                  <p class="oi-ch" [class.build]="leg.snapshot.oiChange > 0" [class.unwind]="leg.snapshot.oiChange < 0">
                    OI Δ {{ leg.snapshot.oiChange > 0 ? '+' : '' }}{{ leg.snapshot.oiChange | number }}
                  </p>
                } @else {
                  <p class="greek-missing">Greeks unavailable</p>
                }
              </article>
            }
          </div>
        </section>
      }
    }
  `,
  styles: [
    `
      .widgets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
        margin: 12px 0;
      }
      .widget {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.22);
      }
      .widget-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: 0.72rem;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .widget-sub {
        font-size: 0.62rem;
        color: var(--muted);
        font-weight: 500;
      }
      .oi-bar-track {
        display: flex;
        height: 10px;
        border-radius: 5px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.06);
      }
      .oi-seg.calls {
        background: linear-gradient(90deg, #166534, #4ade80);
      }
      .oi-seg.puts {
        background: linear-gradient(90deg, #f87171, #991b1b);
      }
      .oi-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 0.65rem;
      }
      .oi-labels .ce { color: #4ade80; }
      .oi-labels .pe { color: #f87171; }
      .skew-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.7rem;
        margin-bottom: 6px;
      }
      .skew-val.bear { color: #f87171; }
      .skew-val.bull { color: #4ade80; }
      .skew-meter {
        position: relative;
        height: 8px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        margin-bottom: 8px;
        overflow: hidden;
      }
      .skew-mid {
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 1px;
        background: rgba(255, 255, 255, 0.2);
      }
      .skew-fill {
        position: absolute;
        top: 0;
        bottom: 0;
        background: #a78bfa;
        border-radius: 4px;
      }
      .skew-fill.left {
        right: 50%;
        background: #4ade80;
      }
      .skew-fill:not(.left) {
        left: 50%;
        background: #f87171;
      }
      .vix-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.68rem;
      }
      .vix-val {
        font-weight: 700;
        font-size: 0.9rem;
      }
      .vix-hint {
        color: var(--muted);
        margin-left: auto;
      }
      .pain-strike {
        font-size: 1.2rem;
        font-weight: 700;
      }
      .pain-dist {
        font-size: 0.68rem;
        color: var(--muted);
      }
      .pain-dist.above { color: #f87171; }
      .pain-dist.below { color: #4ade80; }
      .pain-hint {
        margin: 6px 0 0;
        font-size: 0.62rem;
        color: var(--muted);
      }
      .greeks-panel {
        margin: 12px 0;
        padding: 12px;
        border-radius: 10px;
        border: 1px solid rgba(167, 139, 250, 0.22);
        background: rgba(167, 139, 250, 0.04);
      }
      .greeks-head {
        display: flex;
        justify-content: space-between;
        font-size: 0.78rem;
        font-weight: 700;
        margin-bottom: 10px;
      }
      .greeks-strike {
        font-size: 0.65rem;
        color: var(--muted);
        font-weight: 500;
      }
      .greeks-cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      @media (max-width: 520px) {
        .greeks-cards { grid-template-columns: 1fr; }
      }
      .greek-card {
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: rgba(0, 0, 0, 0.2);
      }
      .greek-card.ce { border-color: rgba(74, 222, 128, 0.3); }
      .greek-card.pe { border-color: rgba(248, 113, 113, 0.3); }
      .greek-card-head {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .greek-card-head .side {
        font-weight: 800;
        font-size: 0.8rem;
      }
      .greek-card.ce .side { color: #4ade80; }
      .greek-card.pe .side { color: #f87171; }
      .premium {
        font-size: 0.72rem;
        color: var(--muted);
      }
      .greek-grid {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .greek-row {
        display: grid;
        grid-template-columns: 36px 1fr 44px;
        gap: 6px;
        align-items: center;
        font-size: 0.65rem;
      }
      .greek-key {
        color: var(--muted);
        font-weight: 600;
      }
      .greek-bar-wrap {
        height: 6px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 3px;
        overflow: hidden;
      }
      .greek-bar {
        height: 100%;
        background: #a78bfa;
        border-radius: 3px;
        min-width: 2px;
      }
      .greek-bar.neg { background: #fb923c; }
      .greek-val {
        text-align: right;
        font-family: ui-monospace, monospace;
        font-size: 0.62rem;
      }
      .oi-ch {
        margin: 8px 0 0;
        font-size: 0.62rem;
        color: var(--muted);
      }
      .oi-ch.build { color: #22d3ee; }
      .oi-ch.unwind { color: #fb923c; }
      .greek-missing {
        font-size: 0.68rem;
        color: var(--muted);
        margin: 0;
      }
    `,
  ],
})
export class OptionChainWidgetsComponent {
  readonly payload = signal<OptionChainSignalPayload | null>(null);

  @Input({ required: true })
  set data(value: OptionChainSignalPayload | null | undefined) {
    this.payload.set(value ?? null);
  }

  readonly callOiShare = computed(() => {
    const g = this.payload()?.guard;
    if (!g) return 50;
    const total = g.callOiTotal + g.putOiTotal;
    if (total <= 0) return 50;
    return (g.callOiTotal / total) * 100;
  });

  readonly putOiShare = computed(() => 100 - this.callOiShare());

  painDist(): number {
    const oc = this.payload();
    if (!oc) return 0;
    return oc.guard.spotLtp - oc.guard.maxPain;
  }

  formatSkew(skew: number | null | undefined): string {
    if (skew == null || !Number.isFinite(skew)) return '—';
    return `${skew >= 0 ? '+' : ''}${skew.toFixed(2)}`;
  }

  skewMeterWidth(skew: number | null | undefined): number {
    if (skew == null || !Number.isFinite(skew)) return 0;
    return Math.min(50, Math.abs(skew) * 8);
  }

  vixHint(vix: number): string {
    if (vix < 12) return 'Calm';
    if (vix < 16) return 'Normal';
    if (vix < 20) return 'Elevated';
    return 'Fear';
  }

  greekLegs(greeks: OptionChainAtmGreeks): Array<{
    side: 'CE' | 'PE';
    ltp: number;
    snapshot: OptionChainAtmGreeks['ce'];
  }> {
    return [
      { side: 'CE', ltp: greeks.ce?.ltp ?? 0, snapshot: greeks.ce },
      { side: 'PE', ltp: greeks.pe?.ltp ?? 0, snapshot: greeks.pe },
    ];
  }

  greekRows(leg: NonNullable<OptionChainAtmGreeks['ce']>): Array<{
    key: string;
    value: number;
    display: string;
    bar: number;
  }> {
    const rows = [
      { key: 'Δ', value: leg.delta ?? 0, scale: 1 },
      { key: 'Γ', value: leg.gamma ?? 0, scale: 0.02 },
      { key: 'Θ', value: leg.theta ?? 0, scale: 5 },
      { key: 'ν', value: leg.vega ?? 0, scale: 2 },
      { key: 'IV', value: leg.iv ?? 0, scale: 30 },
    ];
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      display: Number.isFinite(r.value) ? r.value.toFixed(r.key === 'IV' ? 1 : 3) : '—',
      bar: Math.min(100, Math.max(4, (Math.abs(r.value) / r.scale) * 100)),
    }));
  }
}