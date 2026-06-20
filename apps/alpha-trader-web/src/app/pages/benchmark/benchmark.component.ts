import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LoaderComponent } from '../../shared/loader/loader.component';
import { FormsModule } from '@angular/forms';
import {
  AreaSeries,
  ColorType,
  IChartApi,
  ISeriesApi,
  LineData,
  Time,
  createChart,
} from 'lightweight-charts';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import {
  BenchmarkApiService,
  BenchmarkJobStatus,
  BenchmarkMatrixVariantResult,
  BenchmarkOptions,
  BenchmarkReport,
} from '../../core/services/benchmark-api.service';
import { DeckContextService } from '../../core/services/deck-context.service';
import {
  BenchmarkExportFormat,
  fmtExcursion,
  fmtInr,
  fmtPrice,
  formatReportExport,
  hitLabel,
} from './benchmark-export.util';

type ResultsTab = 'summary' | 'details' | 'insights' | 'compare';

interface BenchmarkHistoryEntry {
  reportId: string;
  symbol: string;
  style: string;
  days: number;
  exitPolicy: string;
  positionPolicy: string;
  totalR: number;
  winRate: number;
  trades: number;
  generatedAt: string;
  label: string;
}

interface ExitBarRow {
  label: string;
  count: number;
  cls: string;
}

const HISTORY_STORAGE_KEY = 'alpha-trader-benchmark-history-v1';

@Component({
  selector: 'app-benchmark',
  standalone: true,
  imports: [CommonModule, FormsModule, LoaderComponent],
  template: `
    <section class="deck-page benchmark-page">
      @if (showConfig()) {
        <div class="config-panel" aria-label="Benchmark configuration">
          <header class="config-header">
            <h1>Benchmark</h1>
            <p class="config-sub">
              Replay engine signals · PA-only backtest · export results
            </p>
          </header>

          <form class="config-form" (ngSubmit)="run()">
            <section class="config-section">
              <h2>Symbol &amp; style</h2>
              <p class="section-hint">
                Index to replay. Style sets the primary scan timeframe (Scalper
                5m · Intraday 15m · Positional 1h).
              </p>
              <label class="field">
                <span>Index</span>
                <select
                  [(ngModel)]="symbol"
                  name="symbol"
                  (ngModelChange)="loadOptions()"
                >
                  @for (s of options()?.symbols ?? []; track s.symbol) {
                    <option [value]="s.symbol">{{ s.label }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span>Trading style</span>
                <select
                  [(ngModel)]="style"
                  name="style"
                  (ngModelChange)="loadOptions()"
                >
                  @for (s of options()?.tradingStyles ?? []; track s.id) {
                    <option [value]="s.id">{{ s.label }}</option>
                  }
                </select>
              </label>
            </section>

            <section class="config-section">
              <h2>Window</h2>
              <p class="section-hint">
                Calendar days to replay ({{ limits.minDays }}–{{
                  limits.maxDays
                }}). Shorter windows run faster.
              </p>
              <div class="field-row">
                <label class="field">
                  <span>Days</span>
                  <input
                    type="number"
                    [(ngModel)]="days"
                    name="days"
                    [min]="limits.minDays"
                    [max]="limits.maxDays"
                  />
                </label>
                <label class="field">
                  <span>Max trades/day</span>
                  <input
                    type="number"
                    [(ngModel)]="maxTradesPerDay"
                    name="maxTradesPerDay"
                    min="1"
                    [max]="limits.maxTradesPerDay"
                    placeholder="Unlimited"
                  />
                </label>
              </div>
              <div class="field-row">
                <label class="field">
                  <span>Window end (optional)</span>
                  <input
                    type="date"
                    [(ngModel)]="windowEndDate"
                    name="windowEndDate"
                  />
                </label>
                <label class="field">
                  <span>Window start (optional)</span>
                  <input
                    type="date"
                    [(ngModel)]="windowStartDate"
                    name="windowStartDate"
                  />
                </label>
              </div>
            </section>

            <section class="config-section">
              <h2>Flow &amp; session filters</h2>
              <p class="section-hint">PA-only mode (option flow disabled for entry decisions)</p>
              <label class="check-field">
                <input
                  type="checkbox"
                  [(ngModel)]="chaseDecay"
                  name="chaseDecay"
                />
                <span
                  >Chase decay — penalize or block late extended entries</span
                >
              </label>
              <label class="check-field">
                <input
                  type="checkbox"
                  [(ngModel)]="greenDayStop"
                  name="greenDayStop"
                />
                <span
                  >Green day stop — no further entries after any trade closes
                  ≥1R</span
                >
              </label>
              <label class="check-field">
                <input type="checkbox" [(ngModel)]="lossCap" name="lossCap" />
                <span>Daily loss cap — stop session when day net ≤ −2R</span>
              </label>
              <label class="check-field">
                <input type="checkbox" [(ngModel)]="avoidFirst5Min" name="avoidFirst5Min" />
                <span>Avoid first 5-min candle — skip entries within first 5m</span>
              </label>
              <label class="check-field">
                <input type="checkbox" [(ngModel)]="avoidTightRange" name="avoidTightRange" />
                <span>Avoid tight range — skip entries when market is range-bound</span>
              </label>
              <label class="check-field">
                <input type="checkbox" [(ngModel)]="requireRetest" name="requireRetest" />
                <span>Require retest — enter only after breakout retest</span>
              </label>
            </section>

            <section class="config-section">
              <h2>Signal entry</h2>
              <p class="section-hint">
                How entries fire. Default engine uses full PA conviction gates;
                fast presets use breakout, volume, and indicator filters on
                5m/15m/1h.
              </p>
              <label class="field">
                <span>Mode</span>
                <select [(ngModel)]="signalMode" name="signalMode">
                  <option value="engine">
                    Default engine (PA conviction gates)
                  </option>
                  <option value="single">Single fast-entry preset</option>
                  <option value="matrix">Compare all entry combos (matrix)</option>
                </select>
              </label>
              @if (signalMode === 'single') {
                <label class="field">
                  <span>Preset</span>
                  <select [(ngModel)]="signalProfile" name="signalProfile">
                    @for (
                      group of options()?.signalPresetGroups ?? [];
                      track group.id
                    ) {
                      <optgroup [label]="group.label">
                        @for (preset of group.presets; track preset.id) {
                          <option [value]="preset.id">
                            {{ preset.label }}
                          </option>
                        }
                      </optgroup>
                    }
                  </select>
                </label>
                @if (signalProfileHint()) {
                  <p class="policy-detail-hint">{{ signalProfileHint() }}</p>
                }
              }
              @if (signalMode === 'matrix') {
                <p class="policy-detail-hint">
                  Will run the default engine + all fast-entry presets and compare results side-by-side.
                </p>
              }
            </section>

            <section class="config-section">
              <h2>Exit strategy</h2>
              <label class="field">
                <span>Mode</span>
                <select [(ngModel)]="exitMode" name="exitMode">
                  <option value="single">Single policy</option>
                  <option value="matrix">Compare all exit policies</option>
                </select>
              </label>
              @if (exitMode === 'single') {
                <label class="field">
                  <span>Policy</span>
                  <select [(ngModel)]="exitPolicy" name="exitPolicy">
                    @for (p of options()?.exitPolicies ?? []; track p.id) {
                      <option [value]="p.id">{{ p.label }}</option>
                    }
                  </select>
                </label>
                @if (exitPolicyHint()) {
                  <p class="policy-detail-hint">{{ exitPolicyHint() }}</p>
                }
              } @else {
                <p class="policy-detail-hint">
                  Runs {{ options()?.exitPolicies?.length ?? 7 }} replays with
                  identical entries — only the trailing exit model changes.
                </p>
              }
            </section>

            <section class="config-section">
              <h2>Position scale-out</h2>
              <label class="field">
                <span>Mode</span>
                <select [(ngModel)]="positionMode" name="positionMode">
                  <option value="single">Single policy</option>
                  <option value="matrix">Compare flat vs scale-ladder</option>
                </select>
              </label>
              @if (positionMode === 'single') {
                <label class="field">
                  <span>Policy</span>
                  <select [(ngModel)]="positionPolicy" name="positionPolicy">
                    @for (p of options()?.positionPolicies ?? []; track p.id) {
                      <option [value]="p.id">{{ p.label }}</option>
                    }
                  </select>
                </label>
                @if (positionPolicyHint()) {
                  <p class="policy-detail-hint">{{ positionPolicyHint() }}</p>
                }
              } @else {
                <p class="policy-detail-hint">
                  Compares flat full-size exits vs 33/33/34 scale-out ladder on
                  the same entries.
                </p>
              }
            </section>

            <section class="config-section">
              <h2>AI &amp; P&amp;L</h2>
              <label class="field">
                <span>AI mode</span>
                <select [(ngModel)]="aiMode" name="aiMode">
                  @for (m of options()?.aiModes ?? []; track m.id) {
                    <option [value]="m.id">{{ m.label }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span>P&amp;L model</span>
                <select [(ngModel)]="pnlModel" name="pnlModel">
                  @for (m of options()?.pnlModels ?? []; track m.id) {
                    <option [value]="m.id">{{ m.label }}</option>
                  }
                </select>
              </label>
            </section>

            <div class="run-estimate" aria-live="polite">
              <span
                >{{ days }} day replay · {{ estimatedReplays() }} run(s) · ~{{
                  estimateMinutes()
                }}
                min</span
              >
              <span class="run-estimate-hint">{{
                options()?.notes?.simulation
              }}</span>
            </div>

            @if (estimatedReplays() > limits.maxReplaysWithoutConfirm) {
              <label class="check-field">
                <input
                  type="checkbox"
                  [(ngModel)]="confirmLargeRun"
                  name="confirmLargeRun"
                />
                <span
                  >Confirm large run ({{ estimatedReplays() }} replays)</span
                >
              </label>
            }

            <button type="submit" class="run-btn" [disabled]="running()">
              Run benchmark
            </button>
            @if (error()) {
              <p class="config-error" role="alert">{{ error() }}</p>
            }
          </form>
        </div>
      }

      @if (running()) {
        <app-loader
          [message]="loadingTitle()"
          [sub]="progressSubtext()"
          [progress]="progressPercent()"
        />
      }

      @if (!showConfig() && report(); as r) {
        <div id="benchmark-app">
          <header class="top-bar">
            <div class="top-left">
              <h1>{{ symbolLabel() }}</h1>
              <div class="meta-row">
                <span class="pill">{{ styleLabel() }}</span>
                <span class="pill muted-pill"
                  >{{ r.params?.days ?? days }}d</span
                >
                @if (r.params?.windowStartDate || r.params?.windowEndDate) {
                  <span class="pill muted-pill">{{ windowRange(r) }}</span>
                }
                <span class="pill ai-pill">{{ aiModeLabel() }}</span>
              </div>
            </div>
            <div class="top-right">
              @if (r.durationMs) {
                <span class="timer-display">{{
                  formatElapsed(r.durationMs)
                }}</span>
              }
              <button type="button" class="rerun-btn" (click)="openConfig()">
                Edit &amp; rerun
              </button>
              <button
                type="button"
                class="export-btn"
                (click)="openExportSheet()"
              >
                Export
              </button>
              <span class="muted">{{ formatGenerated(r.generatedAt) }}</span>
            </div>
          </header>

          <nav
            class="results-tabs"
            role="tablist"
            aria-label="Benchmark results"
          >
            @for (tab of resultTabs; track tab.id) {
              <button
                type="button"
                class="results-tab"
                [class.active]="resultsTab() === tab.id"
                role="tab"
                [attr.aria-selected]="resultsTab() === tab.id"
                (click)="setResultsTab(tab.id)"
              >
                {{ tab.label }}
                @if (tab.id === 'compare' && historyCount() > 0) {
                  <span class="history-tab-badge">{{ historyCount() }}</span>
                }
              </button>
            }
          </nav>

          @if (resultsTab() === 'summary') {
            <section class="benchmark-tab-panel" role="tabpanel">
              <section class="capital-hero" aria-label="Capital projection">
                <div class="capital-hero-inner">
                  <div class="capital-start">
                    <span class="capital-label">Starting</span>
                    <span class="capital-amount">
                      ₹{{
                        r.capitalSummary.startingCapitalInr | number: '1.0-0'
                      }}
                    </span>
                  </div>
                  <div class="capital-arrow" aria-hidden="true">→</div>
                  <div class="capital-end">
                    <span class="capital-label">Ending</span>
                    <span
                      class="capital-amount highlight"
                      [class.positive]="r.capitalSummary.netPnlInr >= 0"
                      [class.negative]="r.capitalSummary.netPnlInr < 0"
                    >
                      ₹{{ r.capitalSummary.endingCapitalInr | number: '1.0-0' }}
                    </span>
                    <span
                      class="capital-delta"
                      [class.positive]="r.capitalSummary.netPnlInr >= 0"
                      [class.negative]="r.capitalSummary.netPnlInr < 0"
                    >
                      {{ r.capitalSummary.netPnlInr >= 0 ? '+' : '' }}₹{{
                        r.capitalSummary.netPnlInr | number: '1.0-0'
                      }}
                      ({{ r.capitalSummary.netPnlPercent }}%)
                    </span>
                  </div>
                </div>
                <p class="capital-risk-note">{{ capitalRiskNote(r) }}</p>
              </section>

              <section class="kpi-grid" aria-label="Summary metrics">
                @for (kpi of kpiCards(r); track kpi.label) {
                  <div class="kpi-card" [class.wide]="kpi.wide">
                    <span class="kpi-label">{{ kpi.label }}</span>
                    <span
                      class="kpi-value"
                      [class.positive]="kpi.tone === 'win'"
                      [class.negative]="kpi.tone === 'loss'"
                    >
                      {{ kpi.value }}
                    </span>
                    @if (kpi.sub) {
                      <span class="kpi-sub">{{ kpi.sub }}</span>
                    }
                  </div>
                }
              </section>

              <section class="summary-verdict" aria-label="Overall verdict">
                <h3>Overall</h3>
                <ul>
                  @for (line of verdictLines(r); track line) {
                    <li [innerHTML]="line"></li>
                  }
                </ul>
              </section>

              @if (hasMatrix(r)) {
                <div class="summary-winner-wrap">
                  <div class="matrix-winner-banner">
                    <span class="matrix-winner-tag">Winner</span>
                    <strong>{{ matrixWinner(r)?.label }}</strong>
                    <span
                      class="matrix-winner-stat"
                      [class.positive]="(matrixWinner(r)?.totalPnlR ?? 0) >= 0"
                      [class.negative]="(matrixWinner(r)?.totalPnlR ?? 0) < 0"
                    >
                      {{ matrixWinner(r)?.totalPnlR }}R total
                    </span>
                    <span class="matrix-winner-sub">
                      {{ matrixWinner(r)?.summary?.winRate ?? 0 }}% win ·
                      {{ matrixWinner(r)?.summary?.totalSignals ?? 0 }} trades ·
                      see Details for trade log
                    </span>
                  </div>
                </div>

                <section class="matrix-panel">
                  <div class="section-head">
                    <h2>Matrix comparison</h2>
                    <span class="muted"
                      >{{ sortedMatrixVariants(r).length }} variants</span
                    >
                  </div>
                  <div class="matrix-table-wrap">
                    <table class="matrix-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Variant</th>
                          <th>Total R</th>
                          <th>Δ base</th>
                          <th>Win%</th>
                          <th>Trades</th>
                          <th>Avg R</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (v of sortedMatrixVariants(r); track v.profileId) {
                          <tr
                            [class.matrix-row-winner]="
                              v.profileId === r.matrixComparison?.winnerId
                            "
                          >
                            <td>{{ v.rank ?? '—' }}</td>
                            <td class="matrix-combo-cell">
                              <span class="matrix-combo-name">{{
                                v.label
                              }}</span>
                              @if (
                                v.profileId === r.matrixComparison?.winnerId
                              ) {
                                <span class="matrix-winner-pill">★</span>
                              }
                            </td>
                            <td
                              [class.positive]="v.totalPnlR >= 0"
                              [class.negative]="v.totalPnlR < 0"
                            >
                              <strong>{{ v.totalPnlR }}R</strong>
                            </td>
                            <td
                              [class.positive]="(v.deltaVsBaselineR ?? 0) >= 0"
                              [class.negative]="(v.deltaVsBaselineR ?? 0) < 0"
                            >
                              {{ formatDeltaR(v.deltaVsBaselineR) }}
                            </td>
                            <td>{{ v.summary.winRate }}%</td>
                            <td>{{ v.summary.totalSignals }}</td>
                            <td
                              [class.positive]="v.summary.avgPnlR >= 0"
                              [class.negative]="v.summary.avgPnlR < 0"
                            >
                              {{ v.summary.avgPnlR }}R
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </section>
              }

              <footer class="notes">
                <p>{{ r.simulationNote }}</p>
                @if (r.optionFlowNote) {
                  <p>{{ r.optionFlowNote }}</p>
                }
                @if (r.stopLossNote) {
                  <p>{{ r.stopLossNote }}</p>
                }
              </footer>
            </section>
          }

          @if (resultsTab() === 'details') {
            <section class="benchmark-tab-panel" role="tabpanel">
              <section class="chart-section">
                <div class="section-head">
                  <h2>Capital curve (₹)</h2>
                  <span
                    class="curve-total"
                    [class.positive]="r.capitalSummary.netPnlInr >= 0"
                    [class.negative]="r.capitalSummary.netPnlInr < 0"
                  >
                    ₹{{ r.capitalSummary.endingCapitalInr | number: '1.0-0' }}
                  </span>
                </div>
                <div #capitalChartHost class="equity-chart"></div>
              </section>

              <section class="chart-section">
                <div class="section-head">
                  <h2>Equity curve (R)</h2>
                  <span
                    class="curve-total"
                    [class.positive]="reportSummary(r).totalR >= 0"
                    [class.negative]="reportSummary(r).totalR < 0"
                  >
                    {{ reportSummary(r).totalR >= 0 ? '+' : ''
                    }}{{ reportSummary(r).totalR }}R
                  </span>
                </div>
                <div #equityChartHost class="equity-chart"></div>
              </section>

              <section class="chart-section">
                <div class="section-head">
                  <h2>Exit breakdown</h2>
                </div>
                <div class="exit-bars">
                  @for (row of exitBars(r); track row.label) {
                    <div class="exit-bar-row">
                      <span class="exit-bar-label">{{ row.label }}</span>
                      <div class="exit-bar-track">
                        <div
                          class="exit-bar-fill"
                          [class]="row.cls"
                          [style.width.%]="
                            exitBarWidth(row.count, r.trades.length)
                          "
                        ></div>
                      </div>
                      <span class="exit-bar-count">{{ row.count }}</span>
                    </div>
                  }
                </div>
              </section>

              <section class="table-section">
                <div class="section-head">
                  <h2>Trade log</h2>
                  <span class="muted"
                    >{{ r.trades.length }} signal{{
                      r.trades.length === 1 ? '' : 's'
                    }}</span
                  >
                </div>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Side</th>
                        <th>Entry</th>
                        <th>SL / TP</th>
                        <th>Exit</th>
                        <th>R</th>
                        <th>Excursion</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (t of r.trades; track t.signalAtISO) {
                        <tr
                          class="trade-main-row"
                          [class.win-row]="isTradeWin(t)"
                          [class.loss-row]="isTradeLoss(t)"
                        >
                          <td>
                            {{ t.sessionDate }}<br />
                            <span class="muted">{{
                              formatTradeTime(t.signalAtISO)
                            }}</span>
                          </td>
                          <td [class]="tradeSideClass(t)">
                            {{ tradeSide(t) }}
                          </td>
                          <td>
                            {{ fmtPrice(t.indexEntry) }}
                            @if (t.optionEntryPremium != null) {
                              <br />
                              <span class="muted">
                                opt ₹{{ t.optionEntryPremium }}→₹{{
                                  t.optionExitPremium
                                }}
                                δ{{ t.optionDelta }}
                              </span>
                            }
                          </td>
                          <td>
                            <span class="hit-sl"
                              >SL {{ fmtPrice(t.stopLoss) }}</span
                            ><br />
                            <span class="muted">
                              {{ fmtPrice(t.takeProfit1) }} /
                              {{ fmtPrice(t.takeProfit2) }} /
                              {{ fmtPrice(t.takeProfit3) }}
                            </span>
                          </td>
                          <td [class]="tradeHitClass(t)">
                            {{ hitLabel(t.hitLevel, t.exitStatus) }}<br />
                            <span class="muted"
                              >&#64; {{ fmtPrice(t.indexExit) }}</span
                            >
                          </td>
                          <td [class]="pnlClass(t.pnlR)">
                            {{ t.pnlR >= 0 ? '+' : '' }}{{ t.pnlR }}R
                            @if (t.pnlInr != null) {
                              <br />
                              <span class="muted">
                                {{ t.pnlInr >= 0 ? '+' : ''
                                }}{{ fmtInr(t.pnlInr) }}
                              </span>
                            }
                          </td>
                          <td class="excursion-cell">
                            {{ fmtExcursion(t).main }}<br />
                            <span class="muted">{{ fmtExcursion(t).sub }}</span>
                          </td>
                        </tr>
                        @if (t.engineVerdict || t.aiVerdictSummary) {
                          <tr
                            class="trade-verdict-row"
                            [class.win-row]="isTradeWin(t)"
                            [class.loss-row]="isTradeLoss(t)"
                          >
                            <td colspan="7" class="verdict-subrow">
                              @if (t.engineVerdict) {
                                <div class="verdict-engine">
                                  {{ t.engineVerdict }}
                                </div>
                              }
                              @if (t.aiVerdictSummary) {
                                <div class="ai-line">
                                  {{ t.aiVerdictSummary }}
                                </div>
                              }
                            </td>
                          </tr>
                        }
                      } @empty {
                        <tr>
                          <td
                            colspan="7"
                            class="muted"
                            style="text-align: center"
                          >
                            No qualifying signals in this window.
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          }

          @if (resultsTab() === 'insights') {
            <section class="benchmark-tab-panel" role="tabpanel">
              <section class="strategy-panel" aria-label="Strategy overview">
                <h2>Strategy overview</h2>
                <div class="strategy-comparison">
                  @if (hasMatrix(r)) {
                    @for (
                      v of sortedMatrixVariants(r).slice(0, 3);
                      track v.profileId;
                      let idx = $index
                    ) {
                      <div
                        class="strategy-card"
                        [class.winner]="
                          v.profileId === r.matrixComparison?.winnerId
                        "
                      >
                        <div class="strategy-card-head">
                          <strong>{{ v.label }}</strong>
                          <span class="strategy-rank">
                            {{
                              v.profileId === r.matrixComparison?.winnerId
                                ? 'Winner'
                                : '#' + (idx + 1)
                            }}
                          </span>
                        </div>
                        <div class="strategy-stats">
                          <span>
                            Total
                            <strong
                              [class.positive]="v.totalPnlR >= 0"
                              [class.negative]="v.totalPnlR < 0"
                            >
                              {{ v.totalPnlR }}R
                            </strong>
                          </span>
                          <span
                            >Win <strong>{{ v.summary.winRate }}%</strong></span
                          >
                          <span
                            >Trades
                            <strong>{{ v.summary.totalSignals }}</strong></span
                          >
                          <span>
                            Δ base
                            <strong
                              [class.positive]="(v.deltaVsBaselineR ?? 0) >= 0"
                              [class.negative]="(v.deltaVsBaselineR ?? 0) < 0"
                            >
                              {{ formatDeltaR(v.deltaVsBaselineR) }}
                            </strong>
                          </span>
                        </div>
                      </div>
                    }
                  } @else {
                    <div class="strategy-card winner">
                      <div class="strategy-card-head">
                        <strong>{{ policyWinnerLabel(r) }}</strong>
                        <span class="strategy-rank">Active run</span>
                      </div>
                      <div class="strategy-stats">
                        <span>
                          Total
                          <strong
                            [class.positive]="reportSummary(r).totalR >= 0"
                            [class.negative]="reportSummary(r).totalR < 0"
                          >
                            {{ reportSummary(r).totalR }}R
                          </strong>
                        </span>
                        <span
                          >Win
                          <strong>{{ reportSummary(r).winRate }}%</strong></span
                        >
                        <span
                          >Trades
                          <strong>{{
                            reportSummary(r).totalTrades
                          }}</strong></span
                        >
                        <span
                          >Avg
                          <strong>{{ reportSummary(r).avgR }}R</strong></span
                        >
                      </div>
                    </div>
                  }
                  <p class="strategy-suggestion">{{ runSuggestion(r) }}</p>
                </div>
              </section>

              <section class="matrix-insights-panel">
                <h2>Run insights</h2>
                <div class="matrix-insights">
                  @for (line of insightLines(r); track line) {
                    <p [innerHTML]="line"></p>
                  }
                </div>
              </section>
            </section>
          }

          @if (resultsTab() === 'compare') {
            <section class="benchmark-tab-panel" role="tabpanel">
              <section class="history-panel" aria-label="Saved benchmark runs">
                <div class="section-head history-head">
                  <h2>Run history</h2>
                  @if (history().length) {
                    <button
                      type="button"
                      class="history-clear-btn"
                      (click)="clearHistory()"
                    >
                      Clear all
                    </button>
                  }
                </div>
                <p class="history-hint">
                  Runs are saved locally. Select up to <strong>3</strong> to
                  compare side-by-side, or tap <strong>Open</strong> to reload a
                  full report.
                </p>
                <div class="history-tray">
                  @if (!history().length) {
                    <p class="history-empty">
                      No saved runs yet — complete a benchmark and it will
                      appear here.
                    </p>
                  } @else {
                    @for (entry of history(); track entry.reportId) {
                      <div
                        class="history-item"
                        [class.selected]="
                          compareSelection().has(entry.reportId)
                        "
                      >
                        <label class="history-check">
                          <input
                            type="checkbox"
                            [checked]="compareSelection().has(entry.reportId)"
                            (change)="toggleCompareSelection(entry.reportId)"
                          />
                        </label>
                        <div class="history-item-main">
                          <span class="history-item-label">{{
                            entry.label
                          }}</span>
                          <span class="history-item-stats">
                            <span
                              [class.positive]="entry.totalR >= 0"
                              [class.negative]="entry.totalR < 0"
                            >
                              {{ entry.totalR }}R
                            </span>
                            · {{ entry.winRate }}% win ·
                            {{ entry.trades }} trades
                          </span>
                          <span class="history-item-time">{{
                            formatGenerated(entry.generatedAt)
                          }}</span>
                        </div>
                        <div class="history-item-actions">
                          <button
                            type="button"
                            class="history-open-btn"
                            (click)="openHistoryReport(entry.reportId)"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            class="history-remove-btn"
                            (click)="removeHistory(entry.reportId)"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    }
                  }
                </div>
              </section>

              @if (compareSelection().size >= 2) {
                <section
                  class="compare-runs-panel"
                  aria-label="Side-by-side comparison"
                >
                  <h2>Side-by-side</h2>
                  <div class="compare-runs-table-wrap">
                    <table class="compare-runs-table">
                      <thead>
                        <tr>
                          <th>Run</th>
                          <th>Total R</th>
                          <th>Win%</th>
                          <th>Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (
                          entry of selectedHistory();
                          track entry.reportId
                        ) {
                          <tr>
                            <td>{{ entry.label }}</td>
                            <td
                              [class.positive]="entry.totalR >= 0"
                              [class.negative]="entry.totalR < 0"
                            >
                              {{ entry.totalR }}R
                            </td>
                            <td>{{ entry.winRate }}%</td>
                            <td>{{ entry.trades }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <div class="compare-verdict">{{ compareVerdict() }}</div>
                </section>
              }
            </section>
          }
        </div>
      }
      @if (showExportSheet()) {
        <div
          class="export-sheet"
          role="dialog"
          aria-labelledby="export-sheet-title"
        >
          <div class="export-sheet-backdrop" (click)="closeExportSheet()"></div>
          <div class="export-sheet-panel">
            <div class="export-sheet-head">
              <h2 id="export-sheet-title">Export report</h2>
              <button
                type="button"
                class="export-close"
                aria-label="Close"
                (click)="closeExportSheet()"
              >
                ×
              </button>
            </div>
            <p class="export-sheet-hint">
              Copy text below or download a multi-sheet Excel workbook for
              comparisons.
            </p>
            <div class="export-tabs" role="tablist" aria-label="Export format">
              @for (tab of exportTabs; track tab.id) {
                <button
                  type="button"
                  class="export-tab"
                  [class.active]="exportFormat() === tab.id"
                  role="tab"
                  [attr.aria-selected]="exportFormat() === tab.id"
                  (click)="setExportFormat(tab.id)"
                >
                  {{ tab.label }}
                </button>
              }
            </div>
            <textarea
              class="export-text"
              readonly
              spellcheck="false"
              [value]="exportText()"
            ></textarea>
            <div class="export-actions">
              <button
                type="button"
                class="export-copy-btn"
                (click)="copyExportText()"
              >
                Copy to clipboard
              </button>
              <button
                type="button"
                class="export-xlsx-btn"
                (click)="downloadExcelReport()"
              >
                Download Excel
              </button>
              @if (exportCopied()) {
                <span class="export-copy-status">Copied!</span>
              }
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class BenchmarkComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('capitalChartHost') capitalChartHost?: ElementRef<HTMLDivElement>;
  @ViewChild('equityChartHost') equityChartHost?: ElementRef<HTMLDivElement>;

  private readonly api = inject(BenchmarkApiService);
  private readonly ctx = inject(DeckContextService);
  private pollSub: Subscription | null = null;
  private timerSub: Subscription | null = null;
  private capitalChart: IChartApi | null = null;
  private equityChart: IChartApi | null = null;
  private capitalSeries: ISeriesApi<'Area'> | null = null;
  private equitySeries: ISeriesApi<'Area'> | null = null;

  readonly resultTabs: Array<{ id: ResultsTab; label: string }> = [
    { id: 'summary', label: 'Summary' },
    { id: 'details', label: 'Details' },
    { id: 'insights', label: 'Insights' },
    { id: 'compare', label: 'Compare' },
  ];

  symbol = 'NSE:NIFTY50-INDEX';
  style = 'INTRADAY';
  days = 14;
  maxTradesPerDay: number | null = null;
  windowStartDate = '';
  windowEndDate = '';
  chaseDecay = false;
  greenDayStop = false;
  lossCap = false;
  avoidFirst5Min = false;
  avoidTightRange = false;
  requireRetest = false;
  signalMode: 'engine' | 'single' | 'matrix' = 'engine';
  signalProfile = 'breakout-vol';
  exitMode: 'single' | 'matrix' = 'single';
  exitPolicy = 'rr-ladder';
  positionMode: 'single' | 'matrix' = 'single';
  positionPolicy = 'flat';
  aiMode = 'off';
  pnlModel = 'index';
  confirmLargeRun = false;

  limits = {
    minDays: 3,
    maxDays: 90,
    maxTradesPerDay: 20,
    maxReplaysWithoutConfirm: 20,
  };

  readonly options = signal<BenchmarkOptions | null>(null);
  readonly jobStatus = signal<BenchmarkJobStatus | null>(null);
  readonly report = signal<BenchmarkReport | null>(null);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  readonly showConfig = signal(true);
  readonly resultsTab = signal<ResultsTab>('summary');
  readonly runStartedAt = signal<number | null>(null);
  readonly runElapsedMs = signal(0);
  readonly history = signal<BenchmarkHistoryEntry[]>([]);
  readonly compareSelection = signal<Set<string>>(new Set());
  readonly showExportSheet = signal(false);
  readonly exportFormat = signal<BenchmarkExportFormat>('summary');
  readonly exportCopied = signal(false);

  readonly exportTabs: Array<{ id: BenchmarkExportFormat; label: string }> = [
    { id: 'summary', label: 'Summary' },
    { id: 'csv', label: 'Trades CSV' },
    { id: 'json', label: 'JSON' },
  ];

  readonly exportText = computed(() => {
    const report = this.report();
    if (!report) return '';
    return formatReportExport(report, this.exportFormat());
  });

  readonly fmtPrice = fmtPrice;
  readonly fmtInr = fmtInr;
  readonly hitLabel = hitLabel;
  readonly fmtExcursion = fmtExcursion;

  readonly symbolLabel = computed(() => {
    const match = this.options()?.symbols.find((s) => s.symbol === this.symbol);
    return match?.shortName ?? match?.label ?? this.symbol;
  });

  readonly styleLabel = computed(() => {
    const match = this.options()?.tradingStyles.find(
      (s) => s.id === this.style,
    );
    return match?.label ?? this.style;
  });

  readonly progressSubtext = computed(
    () =>
      this.jobStatus()?.progress?.message ||
      'Fetching candles & replaying signals',
  );

  readonly loadingTitle = computed(() => {
    const phase = this.jobStatus()?.progress?.phase;
    if (phase === 'complete') return 'Loading report…';
    if (phase === 'failed') return 'Benchmark failed';
    return 'Running backtest…';
  });

  readonly progressPercent = computed(
    () => this.jobStatus()?.progress?.percent ?? 0,
  );

  readonly runTimer = computed(() => this.formatElapsed(this.runElapsedMs()));

  readonly historyCount = computed(() => this.history().length);

  readonly selectedHistory = computed(() => {
    const ids = this.compareSelection();
    return this.history().filter((entry) => ids.has(entry.reportId));
  });

  readonly compareVerdict = computed(() => {
    const selected = [...this.selectedHistory()].sort(
      (a, b) => b.totalR - a.totalR,
    );
    if (selected.length < 2) return '';
    const winner = selected[0];
    const runner = selected[1];
    const margin = +(winner.totalR - runner.totalR).toFixed(2);
    return `Overall leader: ${winner.label} with ${winner.totalR}R${margin > 0 ? ` (+${margin}R vs next best)` : ''}. Tap Open on a run to inspect its full trade log.`;
  });

  ngOnInit(): void {
    this.ctx.setAppView('benchmark');
    this.loadHistory();
    this.loadOptions();
  }

  ngAfterViewInit(): void {
    this.mountDetailCharts();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.timerSub?.unsubscribe();
    this.destroyCharts();
  }

  loadOptions(): void {
    this.api.getOptions(this.symbol, this.style).subscribe({
      next: (opts) => {
        this.options.set(opts);
        this.limits = opts.limits;
        this.days = Number(opts.defaults['days'] ?? this.days);
        this.exitPolicy = String(
          opts.defaults['exitPolicy'] ?? this.exitPolicy,
        );
        this.positionPolicy = String(
          opts.defaults['positionPolicy'] ?? this.positionPolicy,
        );
        this.aiMode = String(opts.defaults['aiMode'] ?? this.aiMode);
        this.pnlModel = String(opts.defaults['pnlModel'] ?? this.pnlModel);
        this.requireRetest = Boolean(
          opts.defaults['requireRetest'] ?? this.requireRetest,
        );
        const defaultProfile = String(
          opts.defaults['signalProfile'] ?? 'engine',
        );
        if (defaultProfile && defaultProfile !== 'engine') {
          this.signalMode = 'single';
          this.signalProfile = defaultProfile;
        }
      },
    });
  }

  signalProfileHint(): string {
    const preset =
      this.options()?.signalPresets.find((p) => p.id === this.signalProfile) ??
      this.options()
        ?.signalPresetGroups.flatMap((g) => g.presets)
        .find((p) => p.id === this.signalProfile);
    if (!preset?.gates?.length) return '';
    return `Gates: ${preset.gates.join(' · ')}`;
  }

  setResultsTab(tab: ResultsTab): void {
    this.resultsTab.set(tab);
    if (tab === 'details') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.mountDetailCharts());
      });
    }
  }

  exitPolicyHint(): string {
    return (
      this.options()?.exitPolicies.find((p) => p.id === this.exitPolicy)
        ?.hint ?? ''
    );
  }

  positionPolicyHint(): string {
    return (
      this.options()?.positionPolicies.find((p) => p.id === this.positionPolicy)
        ?.hint ?? ''
    );
  }

  aiModeLabel(): string {
    return (
      this.options()?.aiModes.find((m) => m.id === this.aiMode)?.label ??
      this.aiMode
    );
  }

  estimateMinutes(): string {
    const replays = this.estimatedReplays();
    const low = Math.max(1, Math.round(this.days * 0.15 * replays));
    const high = Math.max(low + 1, Math.round(this.days * 0.4 * replays));
    return `${low}–${high}`;
  }

  estimatedReplays(): number {
    if (this.exitMode === 'matrix') {
      return this.options()?.exitPolicies?.length ?? 7;
    }
    if (this.positionMode === 'matrix') return 2;
    if (this.signalMode === 'matrix') {
      // engine + fast presets
      const presets = this.options()?.signalPresets?.length ?? 10;
      return presets + 1;
    }
    return 1;
  }

  openConfig(): void {
    this.showConfig.set(true);
    // Clear previous results so they don't remain visible when scrolling while editing config
    this.report.set(null);
    this.jobStatus.set(null);
  }

  openExportSheet(): void {
    if (!this.report()) return;
    this.exportCopied.set(false);
    this.showExportSheet.set(true);
  }

  closeExportSheet(): void {
    this.showExportSheet.set(false);
    this.exportCopied.set(false);
  }

  setExportFormat(format: BenchmarkExportFormat): void {
    this.exportFormat.set(format);
    this.exportCopied.set(false);
  }

  async copyExportText(): Promise<void> {
    const text = this.exportText();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      this.exportCopied.set(true);
      setTimeout(() => this.exportCopied.set(false), 2000);
    } catch {
      this.exportCopied.set(true);
      setTimeout(() => this.exportCopied.set(false), 2000);
    }
  }

  downloadExcelReport(): void {
    const id = this.report()?.reportId;
    if (!id) return;
    const link = document.createElement('a');
    link.href = this.api.exportUrl(id);
    link.download = '';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  isTradeWin(t: BenchmarkReport['trades'][number]): boolean {
    if (t.isWin === true) return true;
    return (
      t.exitStatus === 'TAKE_PROFIT' ||
      (t.pnlR > 0.05 && t.exitStatus !== 'STOP_LOSS')
    );
  }

  isTradeLoss(t: BenchmarkReport['trades'][number]): boolean {
    return !this.isTradeWin(t) && t.pnlR < -0.05;
  }

  tradeSide(t: BenchmarkReport['trades'][number]): string {
    return t.action === 'CE-BUY' ? 'CE' : 'PE';
  }

  tradeSideClass(t: BenchmarkReport['trades'][number]): string {
    return t.action === 'CE-BUY' ? 'side-ce' : 'side-pe';
  }

  tradeHitClass(t: BenchmarkReport['trades'][number]): string {
    if (t.hitLevel === 'STOP_LOSS' || t.exitStatus === 'STOP_LOSS')
      return 'hit-sl';
    if (t.hitLevel === 'SIGNAL_FLIP') return 'hit-tp';
    return 'hit-tp';
  }

  pnlClass(pnlR: number): string {
    if (pnlR > 0.05) return 'positive';
    if (pnlR < -0.05) return 'negative';
    return '';
  }

  formatTradeTime(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  run(): void {
    this.error.set(null);
    if (
      this.estimatedReplays() > this.limits.maxReplaysWithoutConfirm &&
      !this.confirmLargeRun
    ) {
      this.error.set('Confirm large run before starting');
      return;
    }

    this.running.set(true);
    this.showConfig.set(false);
    this.report.set(null);
    this.jobStatus.set(null);
    this.runStartedAt.set(Date.now());
    this.runElapsedMs.set(0);
    this.startRunTimer();
    this.pollSub?.unsubscribe();

    const replays = this.estimatedReplays();
    const body: Record<string, unknown> = {
      symbol: this.symbol,
      tradingStyle: this.style,
      days: this.days,
      aiMode: this.aiMode,
      pnlModel: this.pnlModel,
      chaseDecay: this.chaseDecay,
      greenDayStop: this.greenDayStop,
      confirmLargeRun:
        this.confirmLargeRun || replays > this.limits.maxReplaysWithoutConfirm,
    };
    if (this.lossCap) {
      body['dailyLossCapR'] = -2;
    }
    if (this.exitMode === 'matrix') {
      body['exitMatrix'] = (this.options()?.exitPolicies ?? []).map(
        (p) => p.id,
      );
    } else {
      body['exitPolicy'] = this.exitPolicy;
    }
    if (this.positionMode === 'matrix') {
      body['positionMatrix'] = (this.options()?.positionPolicies ?? []).map(
        (p) => p.id,
      );
    } else {
      body['positionPolicy'] = this.positionPolicy;
    }
    if (this.maxTradesPerDay != null && this.maxTradesPerDay > 0) {
      body['maxTradesPerDay'] = this.maxTradesPerDay;
    }
    if (this.windowStartDate) body['windowStartDate'] = this.windowStartDate;
    if (this.windowEndDate) body['windowEndDate'] = this.windowEndDate;
    body['avoidFirst5Min'] = this.avoidFirst5Min;
    body['avoidTightRange'] = this.avoidTightRange;
    body['requireRetest'] = this.requireRetest;
    if (this.signalMode === 'matrix') {
      const all = (this.options()?.signalPresets ?? []).map((p) => p.id);
      body['signalMatrix'] = ['engine', ...all.filter((id) => id !== 'engine')];
    } else if (this.signalMode === 'single' && this.signalProfile) {
      body['signalProfile'] = this.signalProfile;
    }

    this.api.start(body).subscribe({
      next: ({ jobId }) => this.pollJob(jobId),
      error: (err) => {
        this.stopRunTimer();
        this.running.set(false);
        this.showConfig.set(true);
        this.error.set(this.formatServerError(err) || 'Start failed');
      },
    });
  }

  reportSummary(r: BenchmarkReport): NonNullable<BenchmarkReport['summary']> {
    if (r.summary) return r.summary;
    const b = r.aiComparison?.baseline;
    const pnls = (r.trades ?? []).map((t) => t.pnlR);
    return {
      totalR: b?.totalPnlR ?? 0,
      winRate: b?.winRate ?? 0,
      totalTrades: b?.totalSignals ?? 0,
      avgR: b?.avgPnlR ?? 0,
      bestR: pnls.length ? Math.max(...pnls) : 0,
      worstR: pnls.length ? Math.min(...pnls) : 0,
    };
  }

  hasMatrix(r: BenchmarkReport): boolean {
    return (r.matrixComparison?.variants?.length ?? 0) > 0;
  }

  sortedMatrixVariants(r: BenchmarkReport): BenchmarkMatrixVariantResult[] {
    const matrix = r.matrixComparison;
    if (!matrix?.variants?.length) return [];
    return [...matrix.variants].sort(
      (a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.totalPnlR - a.totalPnlR,
    );
  }

  matrixWinner(r: BenchmarkReport): BenchmarkMatrixVariantResult | null {
    const matrix = r.matrixComparison;
    if (!matrix?.variants?.length) return null;
    const sorted = this.sortedMatrixVariants(r);
    return (
      sorted.find((v) => v.profileId === matrix.winnerId) ?? sorted[0] ?? null
    );
  }

  formatDeltaR(delta?: number): string {
    if (delta == null || Number.isNaN(Number(delta))) return '—';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(2)}R`;
  }

  kpiCards(r: BenchmarkReport): Array<{
    label: string;
    value: string;
    sub?: string;
    tone?: 'win' | 'loss' | '';
    wide?: boolean;
  }> {
    const summary = this.reportSummary(r);
    const wins = r.trades.filter((t) => t.pnlR > 0).length;
    const losses = r.trades.filter((t) => t.pnlR <= 0).length;
    const tp = this.tpCounts(r.trades);
    return [
      {
        label: 'Win rate',
        value: `${summary.winRate}%`,
        sub: `${wins}W / ${losses}L`,
      },
      {
        label: 'Total R',
        value: `${summary.totalR}R`,
        sub: `avg ${summary.avgR}R`,
        tone: summary.totalR >= 0 ? 'win' : 'loss',
      },
      {
        label: 'Signals',
        value: String(summary.totalTrades),
        sub: `${wins + losses} decided`,
      },
      {
        label: 'Max drawdown',
        value: `${r.capitalSummary.maxDrawdownPercent ?? 0}%`,
        sub: `₹${r.capitalSummary.maxDrawdownInr ?? 0} · ${r.capitalSummary.maxDrawdownR ?? 0}R`,
        tone: 'loss',
      },
      {
        label: 'TP / trail',
        value: `${tp['1:1'] ?? 0}/${tp['1:1.5'] ?? 0}/${tp['1:2.5'] ?? 0}/${tp['1:4'] ?? 0}`,
        sub: `SL ${this.exitCount(r.trades, 'STOP_LOSS')} · Flip ${this.exitCount(r.trades, 'SIGNAL_FLIP')}`,
        wide: true,
      },
    ];
  }

  verdictLines(r: BenchmarkReport): string[] {
    const summary = this.reportSummary(r);
    const lines: string[] = [];
    if (this.hasMatrix(r) && r.matrixComparison) {
      const winner = this.matrixWinner(r);
      lines.push(
        `Matrix winner <strong>${r.matrixComparison.winnerLabel}</strong> — <strong>${winner?.totalPnlR ?? 0}R</strong> (${winner?.summary.winRate ?? 0}% win, ${winner?.summary.totalSignals ?? 0} trades)`,
      );
    } else {
      lines.push(
        `Active profile: <strong>${this.policyWinnerLabel(r)}</strong>`,
      );
    }
    lines.push(
      `Net engine result: <strong>${summary.totalR}R</strong> · ${summary.winRate}% win · ${summary.totalTrades} signals`,
      this.runSuggestion(r),
    );
    if (r.params?.exitPolicy) {
      lines.push(
        `Exit policy: ${this.exitPolicyLabel(r.params.exitPolicy)} · Position: ${this.positionPolicyLabel(r.params.positionPolicy ?? 'flat')}`,
      );
    }
    const filterLine = this.filterStatsLine(r);
    if (filterLine) lines.push(filterLine);
    return lines;
  }

  insightLines(r: BenchmarkReport): string[] {
    const summary = this.reportSummary(r);
    const lines = [
      `${this.policyWinnerLabel(r)} produced ${summary.totalR}R across ${summary.totalTrades} trades (${summary.winRate}% win rate).`,
      `Best trade ${summary.bestR}R · worst ${summary.worstR}R · max drawdown ${r.capitalSummary.maxDrawdownR ?? 0}R.`,
      this.runSuggestion(r),
    ];
    if (r.matrixComparison?.baselineLabel) {
      lines.push(
        `Baseline: <strong>${r.matrixComparison.baselineLabel}</strong> — Δ base shows extra R vs this reference variant.`,
      );
    }
    for (const insight of r.matrixComparison?.insights ?? []) {
      lines.push(insight);
    }
    for (const note of r.matrixComparison?.notes ?? []) {
      lines.push(note);
    }
    const filterLine = this.filterStatsLine(r);
    if (filterLine) lines.push(filterLine);
    if (!r.params?.aiMode || r.params.aiMode === 'off') {
      lines.push(
        'AI mode is off — run with shadow or active to compare engine vs model opinions.',
      );
    }
    return lines;
  }

  filterStatsLine(r: BenchmarkReport): string {
    const f = r.filterStats;
    if (!f) return '';
    const parts: string[] = [];
    if (f.chaseDecayFiltered > 0 || f.chaseBlocked > 0) {
      parts.push(
        `chase decay blocked ${f.chaseBlocked}, filtered ${f.chaseDecayFiltered}`,
      );
    }
    if (f.sessionDayBlocked > 0) {
      parts.push(`session rules blocked ${f.sessionDayBlocked}`);
    }
    if (f.maxTradesBlocked > 0) {
      parts.push(`max-trades cap blocked ${f.maxTradesBlocked}`);
    }
    if ((f.avoidFirst5MinBlocked ?? 0) > 0) {
      parts.push(`first-5m blocked ${f.avoidFirst5MinBlocked}`);
    }
    if ((f.avoidTightRangeBlocked ?? 0) > 0) {
      parts.push(`tight-range blocked ${f.avoidTightRangeBlocked}`);
    }
    if ((f.requireRetestBlocked ?? 0) > 0) {
      parts.push(`retest gate blocked ${f.requireRetestBlocked}`);
    }
    if (!parts.length) return '';
    return `Entry filters: ${parts.join(' · ')}.`;
  }

  policyWinnerLabel(r: BenchmarkReport): string {
    if (r.matrixComparison?.winnerLabel) {
      return r.matrixComparison.winnerLabel;
    }
    const exit = this.exitPolicyLabel(r.params?.exitPolicy ?? this.exitPolicy);
    const position = this.positionPolicyLabel(
      r.params?.positionPolicy ?? this.positionPolicy,
    );
    return `${exit} · ${position}`;
  }

  capitalRiskNote(r: BenchmarkReport): string {
    const note = r.capitalSummary.note ? `${r.capitalSummary.note} ` : '';
    return `${note}Max drawdown ${r.capitalSummary.maxDrawdownPercent}% (₹${r.capitalSummary.maxDrawdownInr} / ${r.capitalSummary.maxDrawdownR}R).`;
  }

  runSuggestion(r: BenchmarkReport): string {
    const summary = this.reportSummary(r);
    if (!summary.totalTrades)
      return 'No trades fired — widen the window or relax entry filters.';
    if (summary.totalR >= 2)
      return `Strong edge — ${summary.totalR}R over ${summary.totalTrades} trades.`;
    if (summary.totalR >= 0)
      return `Marginal positive — ${summary.totalR}R; watch drawdowns before sizing up.`;
    return `Underwater — ${summary.totalR}R; revisit exit policy or trading style.`;
  }

  exitBars(r: BenchmarkReport): ExitBarRow[] {
    const tp = this.tpCounts(r.trades);
    const total = Math.max(1, r.trades.length);
    void total;
    return [
      {
        label: 'Stop loss',
        count: this.exitCount(r.trades, 'STOP_LOSS'),
        cls: 'sl',
      },
      { label: 'Early 1R', count: tp['1:1'] ?? 0, cls: 'tp1' },
      { label: 'TP 1:1.5', count: tp['1:1.5'] ?? 0, cls: 'tp1' },
      { label: 'TP 1:2.5', count: tp['1:2.5'] ?? 0, cls: 'tp2' },
      { label: 'TP 1:4', count: tp['1:4'] ?? 0, cls: 'tp3' },
      {
        label: 'Trail ratchet',
        count: this.exitCount(r.trades, 'TRAIL_FLOOR'),
        cls: 'tp3',
      },
      {
        label: 'Signal flip',
        count: this.exitCount(r.trades, 'SIGNAL_FLIP'),
        cls: 'tp1',
      },
      {
        label: 'Session tighten',
        count: this.exitCount(r.trades, 'SESSION_TIGHTEN'),
        cls: 'tp2',
      },
      {
        label: 'Session end',
        count: this.exitCount(r.trades, 'SESSION_END'),
        cls: 'session',
      },
    ];
  }

  exitBarWidth(count: number, total: number): number {
    return (count / Math.max(1, total)) * 100;
  }

  formatGenerated(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatDateShort(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  windowRange(r: BenchmarkReport): string | null {
    const start = r.params?.windowStartDate;
    const end = r.params?.windowEndDate;
    if (start && end) return `${this.formatDateShort(start)} → ${this.formatDateShort(end)}`;
    if (start) return `from ${this.formatDateShort(start)}`;
    if (end) return `to ${this.formatDateShort(end)}`;
    return null;
  }

  formatServerError(err: any): string {
    if (!err) return '';
    if (typeof err === 'string') return err;
    const payload = err.error ?? err;
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (payload?.error) {
      if (typeof payload.error === 'string') return payload.error;
      if (payload.error?.message) return payload.error.message;
    }
    if (payload?.message) return payload.message;
    if (err?.message) return err.message;
    try {
      const json = JSON.stringify(payload);
      return json.length > 500 ? json.slice(0, 500) + '…' : json;
    } catch {
      return String(payload);
    }
  }

  formatElapsed(ms: number): string {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  toggleCompareSelection(reportId: string): void {
    this.compareSelection.update((current) => {
      const next = new Set(current);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else if (next.size < 3) {
        next.add(reportId);
      }
      return next;
    });
  }

  openHistoryReport(reportId: string): void {
    this.running.set(true);
    this.showConfig.set(false);
    this.jobStatus.set({
      jobId: '',
      status: 'complete',
      progress: {
        phase: 'complete',
        percent: 100,
        message: 'Opening cached benchmark results',
      },
      reportId,
      error: null,
      jobMaxMs: null,
    });
    this.api.report(reportId).subscribe({
      next: (r) => {
        this.running.set(false);
        this.report.set(this.normalizeReport({ ...r, reportId }));
        this.resultsTab.set('summary');
        requestAnimationFrame(() => this.mountDetailCharts());
      },
      error: (err) => {
        this.running.set(false);
        this.showConfig.set(true);
        this.error.set(this.formatServerError(err) || 'Report failed');
      },
    });
  }

  removeHistory(reportId: string): void {
    this.history.update((entries) =>
      entries.filter((entry) => entry.reportId !== reportId),
    );
    this.compareSelection.update((current) => {
      const next = new Set(current);
      next.delete(reportId);
      return next;
    });
    this.persistHistory();
  }

  clearHistory(): void {
    this.history.set([]);
    this.compareSelection.set(new Set());
    this.persistHistory();
  }

  private pollJob(jobId: string): void {
    this.pollSub = timer(0, 1200)
      .pipe(
        switchMap(() => this.api.status(jobId)),
        takeWhile((s) => s.status === 'queued' || s.status === 'running', true),
      )
      .subscribe({
        next: (status) => {
          this.jobStatus.set(status);
          if (status.progress?.elapsedMs != null) {
            this.runElapsedMs.set(status.progress.elapsedMs);
          }
          if (status.status === 'complete' && status.reportId) {
            this.jobStatus.update((prev) =>
              prev
                ? {
                    ...prev,
                    progress: {
                      ...prev.progress,
                      phase: 'complete',
                      percent: 100,
                      message: 'Opening results',
                    },
                  }
                : prev,
            );
            this.api.report(status.reportId).subscribe({
              next: (r) => {
                this.stopRunTimer();
                this.running.set(false);
                const full = this.normalizeReport({
                  ...r,
                  reportId: status.reportId!,
                });
                this.report.set(full);
                this.resultsTab.set('summary');
                this.saveHistory(full, status.reportId!);
                requestAnimationFrame(() => this.mountDetailCharts());
              },
              error: (err) => {
                this.stopRunTimer();
                this.running.set(false);
                this.showConfig.set(true);
                this.error.set(this.formatServerError(err) || 'Report failed');
              },
            });
          }
          if (status.status === 'failed') {
            this.stopRunTimer();
            this.running.set(false);
            this.showConfig.set(true);
            this.error.set(status.error || 'Benchmark failed');
          }
        },
        error: (err) => {
          this.stopRunTimer();
          this.running.set(false);
          this.showConfig.set(true);
          this.error.set(this.formatServerError(err) || 'Polling failed');
        },
      });
  }

  private startRunTimer(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = timer(0, 1000).subscribe(() => {
      const started = this.runStartedAt();
      if (started) this.runElapsedMs.set(Date.now() - started);
    });
  }

  private stopRunTimer(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = null;
  }

  private mountDetailCharts(): void {
    const report = this.report();
    if (!report || this.resultsTab() !== 'details') return;
    this.destroyCharts();
    this.mountCapitalChart(report);
    this.mountEquityChart(report);
  }

  private mountCapitalChart(report: BenchmarkReport): void {
    const host = this.capitalChartHost?.nativeElement;
    const curve = report.capitalCurve ?? [];
    if (!host || !curve.length) return;
    if (host.clientWidth < 10) return;
    this.capitalChart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#161a20' },
        textColor: '#8b95a8',
      },
      grid: {
        vertLines: { color: '#252b36' },
        horzLines: { color: '#252b36' },
      },
      rightPriceScale: { borderColor: '#252b36' },
      timeScale: { borderColor: '#252b36', timeVisible: true },
    });
    this.capitalSeries = this.capitalChart.addSeries(AreaSeries, {
      lineColor: '#fbbf24',
      topColor: 'rgba(251, 191, 36, 0.35)',
      bottomColor: 'rgba(251, 191, 36, 0.02)',
      lineWidth: 2,
    });
    this.capitalSeries.setData(this.toChartSeries(curve, 'capitalInr'));
    this.capitalChart.timeScale().fitContent();
  }

  private mountEquityChart(report: BenchmarkReport): void {
    const host = this.equityChartHost?.nativeElement;
    const curve = report.equityCurve ?? [];
    if (!host || !curve.length) return;
    if (host.clientWidth < 10) return;

    this.equityChart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#161a20' },
        textColor: '#8b95a8',
      },
      grid: {
        vertLines: { color: '#252b36' },
        horzLines: { color: '#252b36' },
      },
      rightPriceScale: { borderColor: '#252b36' },
      timeScale: { borderColor: '#252b36', timeVisible: true },
    });

    this.equitySeries = this.equityChart.addSeries(AreaSeries, {
      lineColor: '#22d3ee',
      topColor: 'rgba(34, 211, 238, 0.35)',
      bottomColor: 'rgba(34, 211, 238, 0.02)',
      lineWidth: 2,
    });
    this.equitySeries.setData(this.toChartSeries(curve, 'cumulativeR'));
    this.equityChart.timeScale().fitContent();
  }

  private toChartSeries(
    curve: Array<{ t: number; [key: string]: number | string }>,
    valueKey: string,
  ): LineData[] {
    const byTime = new Map<number, number>();
    for (const point of curve) {
      const time = Math.floor(point.t / 1000);
      const value = Number(point[valueKey]);
      if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
      byTime.set(time, value);
    }
    const series = [...byTime.entries()]
      .map(([time, value]) => ({ time: time as Time, value }))
      .sort((a, b) => (a.time as number) - (b.time as number));
    if (series.length === 1) {
      series.unshift({
        time: ((series[0].time as number) - 3600) as Time,
        value: series[0].value,
      });
    }
    return series;
  }

  private destroyCharts(): void {
    this.capitalChart?.remove();
    this.equityChart?.remove();
    this.capitalChart = null;
    this.equityChart = null;
    this.capitalSeries = null;
    this.equitySeries = null;
  }

  private tpCounts(trades: BenchmarkReport['trades']): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const trade of trades) {
      const key = trade.hitLevel;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  private exitCount(trades: BenchmarkReport['trades'], key: string): number {
    return trades.filter((t) => t.hitLevel === key || t.exitStatus === key)
      .length;
  }

  private exitPolicyLabel(id: string): string {
    return this.options()?.exitPolicies.find((p) => p.id === id)?.label ?? id;
  }

  private positionPolicyLabel(id: string): string {
    return (
      this.options()?.positionPolicies.find((p) => p.id === id)?.label ?? id
    );
  }

  private loadHistory(): void {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      this.history.set(Array.isArray(parsed) ? parsed : []);
    } catch {
      this.history.set([]);
    }
  }

  private persistHistory(): void {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.history()));
  }

  private normalizeReport(report: BenchmarkReport): BenchmarkReport {
    const summary = this.reportSummary(report);
    return { ...report, summary };
  }

  private saveHistory(report: BenchmarkReport, reportId: string): void {
    const summary = this.reportSummary(report);
    const entry: BenchmarkHistoryEntry = {
      reportId,
      symbol: report.params?.symbol ?? this.symbol,
      style: report.params?.tradingStyle ?? this.style,
      days: report.params?.days ?? this.days,
      exitPolicy: report.params?.exitPolicy ?? this.exitPolicy,
      positionPolicy: report.params?.positionPolicy ?? this.positionPolicy,
      totalR: summary.totalR,
      winRate: summary.winRate,
      trades: summary.totalTrades,
      generatedAt: report.generatedAt,
      label: this.policyWinnerLabel(report),
    };
    this.history.update((entries) => {
      const filtered = entries.filter((e) => e.reportId !== reportId);
      return [entry, ...filtered].slice(0, 12);
    });
    this.persistHistory();
  }
}
