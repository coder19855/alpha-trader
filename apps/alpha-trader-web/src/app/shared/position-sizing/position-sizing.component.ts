import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DeckApiService } from '../../core/services/deck-api.service';
import { DeckContextService } from '../../core/services/deck-context.service';
import { OptionChainApiService } from '../../core/services/option-chain-api.service';
import { TradingStyle } from '../../core/models/deck.models';
import { OptionMoneyness } from '../../core/models/option-chain.models';

interface RiskRow {
  level: string;
  pnl: number;
  capitalAfter: number;
  onRisk: string;
}

@Component({
  selector: 'app-position-sizing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="sizing-panel">
      <div class="panel-head">
        <span>Position Sizing</span>
      </div>

      <div class="sizing-row">
        <div class="sizing-field">
          <label>Total Capital</label>
          <div class="balance-row">
            <button type="button" class="fetch-btn" (click)="fetchBalance()" [disabled]="fundsLoading()">
              {{ fundsLoading() ? 'Fetching…' : 'Fetch from Fyers' }}
            </button>
            <input
              type="number"
              class="sizing-input"
              [ngModel]="capital()"
              (ngModelChange)="capital.set($event || 0)"
              step="1000"
            />
            <span class="unit">₹</span>
          </div>
          @if (fundsError()) {
            <small class="err">{{ fundsError() }}</small>
          }
          @if (fundsTitle()) {
            <small class="hint">{{ fundsTitle() }}</small>
          }
        </div>

        <div class="sizing-field">
          <label>Instrument</label>
          <div class="inst-row">
            <span class="inst">{{ shortSymbol(symbol || ctx.symbol()) }}</span>
            <span class="lot">Lot: <strong>{{ effectiveLotSize() }}</strong></span>
          </div>
        </div>
      </div>

      <div class="sizing-row slider-row">
        <div class="sizing-field full">
          <label>
            Risk / Allocation %
            <span class="val">{{ riskPct() | number:'1.2-2' }}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.25"
            [ngModel]="riskPct()"
            (ngModelChange)="riskPct.set($event)"
            class="risk-slider"
          />
          <div class="slider-hints">
            <span>0%</span>
            <span>1%</span>
            <span>2%</span>
            <span>3%</span>
            <span>4%</span>
            <span>5%</span>
          </div>
          <small class="hint">Typical day-trading risk: 0.5–2% per setup.</small>
        </div>
      </div>

      <div class="sizing-row">
        <div class="sizing-field">
          <label>Risked Capital</label>
          <div class="computed">₹ {{ riskCapital() | number:'1.0-0' }}</div>
        </div>

        <div class="sizing-field">
          <label>Strike moneyness (optional)</label>
          <select
            class="sizing-input"
            [ngModel]="moneyness()"
            (ngModelChange)="onMoneynessChange($event)"
          >
            <option value="">None — manual risk</option>
            <option value="ATM">ATM</option>
            <option value="OTM">OTM</option>
            <option value="ITM">ITM</option>
          </select>
          <small class="hint">
            Fetches option chain only when selected. Uses live premium for R:R.
          </small>
          @if (moneynessLoading()) {
            <small class="hint">Fetching chain…</small>
          }
          @if (moneynessError()) {
            <small class="err">{{ moneynessError() }}</small>
          }
        </div>

        <div class="sizing-field">
          <label>Est. Risk per Lot (₹)</label>
          <input
            type="number"
            class="sizing-input"
            [ngModel]="estRiskPerLot()"
            (ngModelChange)="updateEstRisk($event)"
            step="50"
          />
          <small class="hint">
            @if (chainPremium()) {
              Premium ₹{{ chainPremium() | number:'1.0-0' }} × lot
              {{ effectiveLotSize() }} → est. risk.
            } @else {
              Premium risk or margin per lot (editable).
            }
          </small>
        </div>

        <div class="sizing-field">
          <label>Suggested Lots</label>
          <div class="computed lots">{{ suggestedLots() }}</div>
          <small class="hint">Based on risked capital ÷ est. per lot</small>
        </div>
      </div>

      <div class="table-wrap">
        <div class="panel-head small">
          <span>Projected P&amp;L (by R-multiple)</span>
          <span class="note">0R = breakeven on risked amount. Assumes 1R risk = risked capital.</span>
        </div>
        <table class="risk-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>P&amp;L (₹)</th>
              <th>Capital After (₹)</th>
              <th>Return on Risk</th>
            </tr>
          </thead>
          <tbody>
            @for (row of riskTable(); track row.level) {
              <tr [class.zero]="row.level === '0R'" [class.loss]="row.pnl < 0" [class.gain]="row.pnl > 0">
                <td class="level">{{ row.level }}</td>
                <td class="pnl">{{ row.pnl | number:'1.0-0' }}</td>
                <td class="cap">{{ row.capitalAfter | number:'1.0-0' }}</td>
                <td class="ret">{{ row.onRisk }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <p class="sizing-note">
        This is a simplified calculator. Real options sizing should account for premium paid, margin,
        Greeks, and your broker's lot rules. Use with the current signal's stops/targets for 1R definition.
      </p>
    </section>
  `,
  styles: [`
    .sizing-panel { padding: 8px 4px; }
    .panel-head { font-weight: 700; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:baseline; font-size:0.85rem; }
    .panel-head.small { font-size:0.78rem; color:var(--muted); }
    .sizing-row { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px; }
    .sizing-field { flex:1; min-width:140px; }
    .sizing-field.full { flex: 1 1 100%; }
    .sizing-field label { display:block; font-size:0.7rem; color:var(--muted); margin-bottom:4px; }
    .sizing-input { width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:#11151c; color:#e8ecf1; font-size:0.85rem; }
    .computed { font-size:1.1rem; font-weight:700; padding:4px 0; }
    .computed.lots { color: var(--option); }
    .balance-row { display:flex; gap:8px; align-items:center; }
    .fetch-btn { padding:4px 10px; font-size:0.7rem; border-radius:6px; border:1px solid rgba(34,211,238,.4); background:rgba(34,211,238,.1); color:#22d3ee; cursor:pointer; }
    .fetch-btn:disabled { opacity:.6; }
    .unit { color:var(--muted); font-size:0.8rem; }
    .inst-row { display:flex; gap:12px; align-items:center; font-size:0.9rem; }
    .lot { font-size:0.8rem; color:var(--muted); }
    .slider-row input[type=range] { width:100%; accent-color: #22d3ee; }
    .val { font-weight:700; color:#22d3ee; margin-left:6px; }
    .slider-hints { display:flex; justify-content:space-between; font-size:0.65rem; color:var(--muted); margin-top:2px; }
    .risk-table { width:100%; border-collapse: collapse; font-size:0.78rem; margin-top:4px; }
    .risk-table th, .risk-table td { padding:6px 8px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.08); }
    .risk-table th { color:var(--muted); font-weight:600; font-size:0.68rem; text-transform:uppercase; }
    .risk-table tr.zero td { background: rgba(255,255,255,0.03); font-weight:600; }
    .risk-table tr.loss .pnl { color:#f87171; }
    .risk-table tr.gain .pnl { color:#4ade80; }
    .level { font-family: ui-monospace, monospace; }
    .sizing-note { font-size:0.68rem; color:var(--muted); margin-top:12px; font-style:italic; }
    .err { color:#f87171; font-size:0.7rem; }
    .hint { color:var(--muted); font-size:0.68rem; }
    .table-wrap { margin-top: 8px; }
  `]
})
export class PositionSizingComponent implements OnInit, OnDestroy {
  private readonly api = inject(DeckApiService);
  private readonly optionApi = inject(OptionChainApiService);
  readonly ctx = inject(DeckContextService);

  @Input() symbol: string | null | undefined = null;
  @Input() lotSize: number | null | undefined = null;
  @Input() paAction: string | null | undefined = null;
  @Input() tradingStyle: TradingStyle | null | undefined = null;

  readonly capital = signal(500000);
  readonly riskPct = signal(1);
  readonly estRiskPerLot = signal(1200);
  readonly moneyness = signal<OptionMoneyness>('');
  readonly moneynessLoading = signal(false);
  readonly moneynessError = signal<string | null>(null);
  readonly chainPremium = signal<number | null>(null);
  readonly fundsLoading = signal(false);
  readonly fundsError = signal<string | null>(null);
  readonly fundsTitle = signal<string>('');

  private moneynessSub: Subscription | null = null;

  readonly effectiveLotSize = computed(() => {
    if (this.lotSize != null) return this.lotSize;
    const sym = this.symbol || this.ctx.symbol();
    const map: Record<string, number> = {
      'NIFTY': 65,
      'BANKNIFTY': 30,
      'FINNIFTY': 60,
      'MIDCPNIFTY': 120,
      'NIFTYNXT50': 25,
      'SENSEX': 20,
      'BANKEX': 30,
    };
    const key = (sym || '').replace(/.*:/, '').replace('-INDEX','').toUpperCase();
    return map[key] || 1;
  });

  readonly riskCapital = computed(() => Math.round(this.capital() * (this.riskPct() / 100)));

  readonly suggestedLots = computed(() => {
    const perLot = Math.max(50, this.estRiskPerLot());
    const riskCap = this.riskCapital();
    return Math.max(0, Math.floor(riskCap / perLot));
  });

  readonly riskTable = computed<RiskRow[]>(() => {
    const risked = this.riskCapital();
    const bal = this.capital();
    const rows: RiskRow[] = [];
    for (let i = -5; i <= 5; i++) {
      const pnl = Math.round(i * risked);
      const after = bal + pnl;
      const onRisk = i === 0 ? '0%' : `${i > 0 ? '+' : ''}${i * 100}%`;
      rows.push({
        level: `${i}R`,
        pnl,
        capitalAfter: after,
        onRisk,
      });
    }
    return rows;
  });

  ngOnInit(): void {
    // defaults only — funds fetched on demand
  }

  ngOnDestroy(): void {
    this.moneynessSub?.unsubscribe();
  }

  onMoneynessChange(value: OptionMoneyness): void {
    this.moneyness.set(value ?? '');
    this.moneynessSub?.unsubscribe();
    this.moneynessError.set(null);
    this.chainPremium.set(null);

    if (!value) return;

    const sym = this.symbol || this.ctx.symbol();
    const style = (this.tradingStyle || this.ctx.style()) as TradingStyle;
    this.moneynessLoading.set(true);
    this.moneynessSub = this.optionApi
      .fetch({
        symbol: sym,
        style,
        moneyness: value,
        paAction: this.paAction ?? undefined,
        refresh: true,
      })
      .subscribe({
        next: (res) => {
          this.moneynessLoading.set(false);
          if (res.estRiskPerLot != null && res.estRiskPerLot > 0) {
            this.estRiskPerLot.set(res.estRiskPerLot);
          }
          if (res.optionPremium != null) {
            this.chainPremium.set(res.optionPremium);
          }
        },
        error: (err) => {
          this.moneynessLoading.set(false);
          const body = err?.error;
          const msg =
            (typeof body === 'object' && body?.error) ||
            (typeof body === 'string' ? body : null) ||
            err?.message ||
            'Option chain fetch failed';
          this.moneynessError.set(msg);
        },
      });
  }

  shortSymbol(s?: string | null): string {
    if (!s) return '—';
    return s.split(':').pop()?.replace('-INDEX', '') || s;
  }

  updateEstRisk(v: number): void {
    this.estRiskPerLot.set(Math.max(50, v || 50));
  }

  async fetchBalance(): Promise<void> {
    this.fundsLoading.set(true);
    this.fundsError.set(null);
    try {
      const res = await this.api.getFunds().toPromise();
      if (res && typeof res.available === 'number' && res.available > 0) {
        this.capital.set(Math.round(res.available));
        this.fundsTitle.set(res.title || 'Available');
      } else {
        this.fundsError.set('No balance returned or zero');
      }
    } catch (e: any) {
      this.fundsError.set(e?.error?.error || e?.message || 'Failed to fetch funds');
    } finally {
      this.fundsLoading.set(false);
    }
  }
}
