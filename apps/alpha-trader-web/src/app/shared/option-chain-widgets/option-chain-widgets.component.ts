import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  OptionChainAtmGreeks,
  OptionChainSignalPayload,
} from '../../core/models/option-chain.models';

type WidgetTopic = 'oiBalance' | 'volatility' | 'maxPain' | 'atmGreeks';

interface WidgetInfoContent {
  title: string;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
}

const WIDGET_INFO: Record<WidgetTopic, WidgetInfoContent> = {
  oiBalance: {
    title: 'OI balance',
    summary: 'How call vs put open interest is distributed across the chain.',
    sections: [
      {
        heading: 'What it shows',
        body: 'The bar splits total OI into call (sky blue) and put (lavender) share. PCR in the header is put OI ÷ call OI — values above 1 mean more put OI than call OI.',
      },
      {
        heading: 'How to read it',
        body: 'Heavy call OI above spot often acts as resistance (writers expect price to stay below). Heavy put OI below spot can act as support. Balance shifts intraday as writers add or unwind.',
      },
      {
        heading: 'Caveat',
        body: 'OI alone does not show who is long vs short — we infer writer activity from OI build/unwind combined with premium change in OI Guard.',
      },
    ],
  },
  volatility: {
    title: 'Volatility',
    summary: 'IV skew and India VIX — fear and directional bias in option pricing.',
    sections: [
      {
        heading: 'IV skew',
        body: 'Compares ATM put IV vs call IV. Positive skew (red) means puts are richer — markets pay more for downside protection (bearish hedging). Negative skew (green) means calls are richer — bullish demand.',
      },
      {
        heading: 'India VIX',
        body: 'Broad market fear gauge. Under 12 = calm, 12–16 = normal, 16–20 = elevated, above 20 = high fear. Rising VIX usually expands option premiums; falling VIX compresses them.',
      },
      {
        heading: 'Trading note',
        body: 'Skew + VIX together: elevated VIX with put skew often favors cautious bullish entries or wider stops; low VIX with call skew can mean complacent upside positioning.',
      },
    ],
  },
  maxPain: {
    title: 'Max pain',
    summary: 'Strike where option writers would face minimum payout if spot settles there.',
    sections: [
      {
        heading: 'Definition',
        body: 'Max pain is computed from open interest at each strike — the strike that minimizes total intrinsic value paid to option buyers at expiry (or as a magnetic reference intraday).',
      },
      {
        heading: 'Distance from spot',
        body: 'Spot well above max pain (red) can pull spot down toward pain into close. Spot below (green) can pull up. Within ~20 pts = pinning zone where price may chop around the strike.',
      },
      {
        heading: 'Intraday use',
        body: 'Not a hard target — use with OI walls and PA structure. Strong trend days can ignore max pain; range days often respect it more.',
      },
    ],
  },
  atmGreeks: {
    title: 'ATM Greeks',
    summary: 'Sensitivity of ATM call and put premiums to spot, time, and volatility.',
    sections: [
      {
        heading: 'Delta (Δ)',
        body: 'Premium change per 1-point spot move. ATM call Δ ≈ 0.5, put ≈ −0.5. Used in position sizing Move column.',
      },
      {
        heading: 'Gamma (Γ)',
        body: 'How fast delta changes as spot moves. High gamma near ATM makes P&L accelerate on large moves (curved payoff).',
      },
      {
        heading: 'Theta (Θ)',
        body: 'Daily time decay — how much premium bleeds per day if spot is flat. Intraday longs fight theta after entry.',
      },
      {
        heading: 'Vega (ν) & IV',
        body: 'Sensitivity to implied volatility. Long options gain from IV expansion (VIX up) and lose from IV crush.',
      },
    ],
  },
};

@Component({
  selector: 'app-option-chain-widgets',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (payload(); as oc) {
      <section class="widgets-grid">
        <article class="widget oi-balance">
          <header class="widget-head">
            <span class="widget-title">
              OI balance
              <button type="button" class="info-btn" (pointerdown)="openInfo($event, 'oiBalance')" aria-label="About OI balance">
                <mat-icon>info_outline</mat-icon>
              </button>
            </span>
            <span class="widget-sub">PCR {{ oc.guard.pcr | number: '1.2-2' }}</span>
          </header>
          <div class="oi-bar-track">
            <div class="oi-seg calls" [style.width.%]="callOiShare()" title="Call OI"></div>
            <div class="oi-seg puts" [style.width.%]="putOiShare()" title="Put OI"></div>
          </div>
          <div class="oi-labels">
            <span class="call-tag">Call {{ oc.guard.callOiTotal | number }}</span>
            <span class="put-tag">Put {{ oc.guard.putOiTotal | number }}</span>
          </div>
        </article>

        <article class="widget skew-vix">
          <header class="widget-head">
            <span class="widget-title">
              Volatility
              <button type="button" class="info-btn" (pointerdown)="openInfo($event, 'volatility')" aria-label="About volatility">
                <mat-icon>info_outline</mat-icon>
              </button>
            </span>
          </header>
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

        <article class="widget pain-widget">
          <header class="widget-head">
            <span class="widget-title">
              Max pain
              <button type="button" class="info-btn" (pointerdown)="openInfo($event, 'maxPain')" aria-label="About max pain">
                <mat-icon>info_outline</mat-icon>
              </button>
            </span>
          </header>
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
            <span class="widget-title">
              ATM Greeks
              <button type="button" class="info-btn" (pointerdown)="openInfo($event, 'atmGreeks')" aria-label="About ATM Greeks">
                <mat-icon>info_outline</mat-icon>
              </button>
            </span>
            <span class="greeks-strike">Strike {{ greeks.atmStrike }}</span>
          </header>
          <div class="greeks-cards">
            @for (leg of greekLegs(greeks); track leg.side) {
              <article class="greek-card" [class.call]="leg.side === 'CE'" [class.put]="leg.side === 'PE'">
                <div class="greek-card-head">
                  <span class="side">{{ leg.side === 'CE' ? 'Call' : 'Put' }}</span>
                  <span class="premium">₹{{ leg.ltp | number: '1.1-1' }}</span>
                </div>
                @if (leg.snapshot) {
                  <div class="greek-grid">
                    @for (row of greekRows(leg.snapshot); track row.key) {
                      <div class="greek-row">
                        <span class="greek-key">{{ row.key }}</span>
                        <div class="greek-bar-wrap">
                          <div class="greek-bar" [style.width.%]="row.bar" [class.neg]="row.value < 0"></div>
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

      @if (infoTopic(); as topic) {
        <div class="detail-backdrop" (pointerdown)="closeInfo()" role="presentation"></div>
        <aside class="detail-panel" role="dialog" [attr.aria-labelledby]="'widget-info-' + topic" (pointerdown)="$event.stopPropagation()">
          <header class="detail-head" (pointerdown)="$event.stopPropagation()">
            <div>
              <h3 [id]="'widget-info-' + topic">{{ infoContent(topic).title }}</h3>
              <p class="detail-sub">{{ infoContent(topic).summary }}</p>
            </div>
            <button type="button" class="detail-close" (click)="closeInfo()" aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </header>
          <div class="detail-body">
            @for (section of infoContent(topic).sections; track section.heading) {
              <section class="detail-section">
                <h4>{{ section.heading }}</h4>
                <p>{{ section.body }}</p>
              </section>
            }
          </div>
        </aside>
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
      .widget-title {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .info-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        vertical-align: middle;
      }
      .info-btn mat-icon { font-size: 14px; width: 14px; height: 14px; }
      .info-btn:hover { color: #22d3ee; }
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
        background: linear-gradient(90deg, rgba(56, 189, 248, 0.35), var(--oc-call, #38bdf8));
      }
      .oi-seg.puts {
        background: linear-gradient(90deg, var(--oc-put, #c4b5fd), rgba(196, 181, 253, 0.35));
      }
      .oi-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 0.65rem;
      }
      .oi-labels .call-tag { color: var(--oc-call, #38bdf8); font-weight: 600; }
      .oi-labels .put-tag { color: var(--oc-put, #c4b5fd); font-weight: 600; }
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
      .skew-fill.left { right: 50%; background: #4ade80; }
      .skew-fill:not(.left) { left: 50%; background: #f87171; }
      .vix-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.68rem;
      }
      .vix-val { font-weight: 700; font-size: 0.9rem; }
      .vix-hint { color: var(--muted); margin-left: auto; }
      .pain-strike { font-size: 1.2rem; font-weight: 700; }
      .pain-dist { font-size: 0.68rem; color: var(--muted); }
      .pain-dist.above { color: #f87171; }
      .pain-dist.below { color: #4ade80; }
      .pain-hint { margin: 6px 0 0; font-size: 0.62rem; color: var(--muted); }
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
      .greeks-strike { font-size: 0.65rem; color: var(--muted); font-weight: 500; }
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
      .greek-card.call { border-color: var(--oc-call-border, rgba(56, 189, 248, 0.38)); }
      .greek-card.put { border-color: var(--oc-put-border, rgba(196, 181, 253, 0.38)); }
      .greek-card-head {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .greek-card-head .side { font-weight: 800; font-size: 0.8rem; }
      .greek-card.call .side { color: var(--oc-call, #38bdf8); }
      .greek-card.put .side { color: var(--oc-put, #c4b5fd); }
      .premium { font-size: 0.72rem; color: var(--muted); }
      .greek-grid { display: flex; flex-direction: column; gap: 5px; }
      .greek-row {
        display: grid;
        grid-template-columns: 36px 1fr 44px;
        gap: 6px;
        align-items: center;
        font-size: 0.65rem;
      }
      .greek-key { color: var(--muted); font-weight: 600; }
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
      .oi-ch { margin: 8px 0 0; font-size: 0.62rem; color: var(--muted); }
      .oi-ch.build { color: #22d3ee; }
      .oi-ch.unwind { color: #fb923c; }
      .greek-missing { font-size: 0.68rem; color: var(--muted); margin: 0; }
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
        width: min(380px, 92vw);
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
      .detail-head h3 { margin: 0; font-size: 1rem; }
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
      .detail-body { padding: 12px 14px 20px; overflow-y: auto; flex: 1; }
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
export class OptionChainWidgetsComponent {
  readonly payload = signal<OptionChainSignalPayload | null>(null);
  readonly infoTopic = signal<WidgetTopic | null>(null);

  @Input({ required: true })
  set data(value: OptionChainSignalPayload | null | undefined) {
    this.payload.set(value ?? null);
    this.infoTopic.set(null);
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

  infoContent(topic: WidgetTopic): WidgetInfoContent {
    return WIDGET_INFO[topic];
  }

  openInfo(event: PointerEvent, topic: WidgetTopic): void {
    event.preventDefault();
    event.stopPropagation();
    this.infoTopic.set(topic);
  }

  closeInfo(): void {
    this.infoTopic.set(null);
  }
}