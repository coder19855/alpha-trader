import { Component, Input, signal } from '@angular/core';
import { DeckStrategyPayload } from '../../core/models/deck.models';

@Component({
  selector: 'app-strategy-panel',
  standalone: true,
  template: `
    <section class="strategy-tab" aria-label="Strategy recommendation">
      @if (strategy?.replayNote) {
        <p class="strategy-replay-note" role="note">{{ strategy!.replayNote }}</p>
      }

      @if (!strategy) {
        <article class="strategy-card strategy-empty">
          <p class="strategy-empty-title">No strategy data</p>
          <p class="strategy-empty-sub muted">
            Connect Fyers and wait for the live signal to populate trade guidance.
          </p>
        </article>
      } @else {
        <div class="strategy-tabs" role="tablist" aria-label="Strategy views">
          <button
            type="button"
            class="strategy-tab-btn"
            [class.active]="activeTab() === 'pa'"
            (click)="activeTab.set('pa')"
          >
            Price action
          </button>
          <button
            type="button"
            class="strategy-tab-btn"
            [class.active]="activeTab() === 'options'"
            (click)="activeTab.set('options')"
          >
            Options
          </button>
        </div>

        @if (activeTab() === 'pa') {
          <div class="strategy-content">
            <article class="strategy-card highlight">
              <div class="strategy-card-head">
                <h3 class="strategy-card-title">Price action playbook</h3>
                <span class="strategy-mode-pill">PA</span>
              </div>

              <div class="strategy-pill-row">
                <span class="strategy-pill" [class]="actionPillClass(strategy.action)">
                  {{ strategy.action }}
                </span>
                <span class="strategy-pill">{{ strategy.bias }}</span>
                <span
                  class="strategy-pill"
                  [class.good]="strategy.conviction >= enterThreshold()"
                  [class.warn]="strategy.conviction < enterThreshold()"
                >
                  {{ strategy.conviction }}% conviction
                </span>
              </div>

              <div class="strategy-conviction-meter" aria-hidden="true">
                <div class="strategy-conviction-track">
                  <div
                    class="strategy-conviction-fill"
                    [class.at-entry]="strategy.conviction >= enterThreshold()"
                    [style.width.%]="convictionWidth()"
                  ></div>
                  @if (strategy.tradeGuidance.thresholds) {
                    <div
                      class="strategy-conviction-marker"
                      [style.left.%]="enterThreshold()"
                      title="Entry threshold"
                    ></div>
                  }
                </div>
                <div class="strategy-conviction-legend">
                  <span>0%</span>
                  @if (strategy.tradeGuidance.thresholds) {
                    <span>Entry {{ strategy.tradeGuidance.thresholds.enter }}%</span>
                  }
                  <span>100%</span>
                </div>
              </div>

              <div class="strategy-detail-grid">
                @if (strategy.recommendation) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Recommendation</span>
                    <span class="strategy-detail-value">{{ strategy.recommendation }}</span>
                  </div>
                }
                @if (strategy.humanSummary) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Summary</span>
                    <span class="strategy-detail-value">{{ strategy.humanSummary }}</span>
                  </div>
                }
              </div>
            </article>

            <article class="strategy-card">
              <div class="strategy-card-head">
                <h3 class="strategy-card-title">PA guidance</h3>
              </div>

              <div class="strategy-guidance-badges">
                <span
                  class="strategy-consider-badge"
                  [class.yes]="strategy.tradeGuidance.shouldConsiderTrade"
                  [class.no]="!strategy.tradeGuidance.shouldConsiderTrade"
                >
                  {{ strategy.tradeGuidance.shouldConsiderTrade ? 'Consider trade' : 'Stand aside' }}
                </span>
                @if (strategy.suggestedRiskPercent !== null && strategy.suggestedRiskPercent !== undefined) {
                  <span class="strategy-pill">
                    Risk {{ strategy.suggestedRiskPercent }}% / trade
                  </span>
                }
              </div>

              <div class="strategy-detail-grid">
                <div class="strategy-detail-row">
                  <span class="strategy-detail-label">Size</span>
                  <span class="strategy-detail-value">
                    {{ strategy.tradeGuidance.sizeRecommendation }}
                  </span>
                </div>
                @if (strategy.tradeGuidance.notes) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Notes</span>
                    <span class="strategy-detail-value">{{ strategy.tradeGuidance.notes }}</span>
                  </div>
                }
                @if (strategy.tradeGuidance.thresholds) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Thresholds</span>
                    <span class="strategy-detail-value">
                      <span class="strategy-threshold-chips">
                        <span class="strategy-threshold-chip">
                          Enter {{ strategy.tradeGuidance.thresholds.enter }}%
                        </span>
                        <span class="strategy-threshold-chip">
                          Strong {{ strategy.tradeGuidance.thresholds.strong }}%
                        </span>
                        <span class="strategy-threshold-chip warn">
                          Caution &lt;{{ strategy.tradeGuidance.thresholds.cautionBelow }}%
                        </span>
                      </span>
                    </span>
                  </div>
                }
                @if (strategy.tradeGuidance.scoringWeights) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Weights</span>
                    <span class="strategy-detail-value">
                      PA {{ weightPct(strategy.tradeGuidance.scoringWeights.priceAction) }}%
                      · Option {{ weightPct(strategy.tradeGuidance.scoringWeights.optionFlow) }}%
                    </span>
                  </div>
                }
                @for (note of strategy.riskNotes ?? []; track note) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Risk note</span>
                    <span class="strategy-detail-value">{{ note }}</span>
                  </div>
                }
              </div>
            </article>

            <article class="strategy-card">
              <div class="strategy-card-head">
                <h3 class="strategy-card-title">
                  PA strategies ({{ strategy.priceActionStrategies?.length ?? strategy.strategies.length }})
                </h3>
                <span class="strategy-mode-pill">PA setups</span>
              </div>

              @if (!paStrategies().length) {
                <div class="strategy-detail-grid">
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Status</span>
                    <span class="strategy-detail-value">
                      No PA strategies ranked for the current regime.
                    </span>
                  </div>
                </div>
              } @else {
                @for (item of paStrategies(); track item.strategy; let i = $index) {
                  <div class="strategy-item">
                    <div class="strategy-item-head">
                      <span class="strategy-item-name">{{ i + 1 }}. {{ item.strategy }}</span>
                      <span class="strategy-score">{{ item.confidenceScore }}%</span>
                    </div>
                    @if (item.risk) {
                      <div class="strategy-risk" [class.low]="isLowRisk(item.risk)">
                        {{ item.risk }}
                      </div>
                    }
                    <div class="strategy-body">{{ item.reason }}</div>
                    @if (item.executionHint) {
                      <div class="strategy-body">Execution: {{ item.executionHint }}</div>
                    }
                  </div>
                }
              }
            </article>
          </div>
        } @else {
          <div class="strategy-content">
            <article class="strategy-card highlight">
              <div class="strategy-card-head">
                <h3 class="strategy-card-title">Options playbook</h3>
                <span class="strategy-mode-pill">Options</span>
              </div>

              <div class="strategy-pill-row">
                <span class="strategy-pill" [class]="actionPillClass(strategy.action)">
                  {{ strategy.action }}
                </span>
                <span class="strategy-pill">{{ strategy.bias }}</span>
                <span
                  class="strategy-pill"
                  [class.good]="strategy.conviction >= enterThreshold()"
                  [class.warn]="strategy.conviction < enterThreshold()"
                >
                  {{ strategy.conviction }}% conviction
                </span>
              </div>

              <div class="strategy-conviction-meter" aria-hidden="true">
                <div class="strategy-conviction-track">
                  <div
                    class="strategy-conviction-fill"
                    [class.at-entry]="strategy.conviction >= enterThreshold()"
                    [style.width.%]="convictionWidth()"
                  ></div>
                  @if (strategy.tradeGuidance.thresholds) {
                    <div
                      class="strategy-conviction-marker"
                      [style.left.%]="enterThreshold()"
                      title="Entry threshold"
                    ></div>
                  }
                </div>
                <div class="strategy-conviction-legend">
                  <span>0%</span>
                  @if (strategy.tradeGuidance.thresholds) {
                    <span>Entry {{ strategy.tradeGuidance.thresholds.enter }}%</span>
                  }
                  <span>100%</span>
                </div>
              </div>

              <div class="strategy-detail-grid">
                @if (strategy.recommendation) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Market view</span>
                    <span class="strategy-detail-value">{{ strategy.recommendation }}</span>
                  </div>
                }
                @if (strategy.humanSummary) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Context</span>
                    <span class="strategy-detail-value">{{ strategy.humanSummary }}</span>
                  </div>
                }
              </div>
            </article>

            <article class="strategy-card">
              <div class="strategy-card-head">
                <h3 class="strategy-card-title">Options guidance</h3>
              </div>

              <div class="strategy-guidance-badges">
                <span
                  class="strategy-consider-badge"
                  [class.yes]="strategy.tradeGuidance.shouldConsiderTrade"
                  [class.no]="!strategy.tradeGuidance.shouldConsiderTrade"
                >
                  {{ strategy.tradeGuidance.shouldConsiderTrade ? 'Option idea active' : 'Wait for setup' }}
                </span>
                @if (strategy.suggestedRiskPercent !== null && strategy.suggestedRiskPercent !== undefined) {
                  <span class="strategy-pill">
                    Risk {{ strategy.suggestedRiskPercent }}% / trade
                  </span>
                }
              </div>

              <div class="strategy-detail-grid">
                <div class="strategy-detail-row">
                  <span class="strategy-detail-label">Structure</span>
                  <span class="strategy-detail-value">
                    {{ strategy.tradeGuidance.sizeRecommendation }}
                  </span>
                </div>
                @if (strategy.tradeGuidance.notes) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Notes</span>
                    <span class="strategy-detail-value">{{ strategy.tradeGuidance.notes }}</span>
                  </div>
                }
                @if (strategy.tradeGuidance.thresholds) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Thresholds</span>
                    <span class="strategy-detail-value">
                      <span class="strategy-threshold-chips">
                        <span class="strategy-threshold-chip">
                          Enter {{ strategy.tradeGuidance.thresholds.enter }}%
                        </span>
                        <span class="strategy-threshold-chip">
                          Strong {{ strategy.tradeGuidance.thresholds.strong }}%
                        </span>
                        <span class="strategy-threshold-chip warn">
                          Caution &lt;{{ strategy.tradeGuidance.thresholds.cautionBelow }}%
                        </span>
                      </span>
                    </span>
                  </div>
                }
                @if (strategy.tradeGuidance.scoringWeights) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Weights</span>
                    <span class="strategy-detail-value">
                      PA {{ weightPct(strategy.tradeGuidance.scoringWeights.priceAction) }}%
                      · Option {{ weightPct(strategy.tradeGuidance.scoringWeights.optionFlow) }}%
                    </span>
                  </div>
                }
                @for (note of strategy.riskNotes ?? []; track note) {
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Risk note</span>
                    <span class="strategy-detail-value">{{ note }}</span>
                  </div>
                }
              </div>
            </article>

            <article class="strategy-card">
              <div class="strategy-card-head">
                <h3 class="strategy-card-title">
                  Option strategies ({{ strategy.optionStrategies?.length ?? strategy.strategies.length }})
                </h3>
                <span class="strategy-mode-pill">Structures</span>
              </div>

              @if (!optionStrategies().length) {
                <div class="strategy-detail-grid">
                  <div class="strategy-detail-row">
                    <span class="strategy-detail-label">Status</span>
                    <span class="strategy-detail-value">
                      No option structures ranked for the current regime.
                    </span>
                  </div>
                </div>
              } @else {
                @for (item of optionStrategies(); track item.strategy; let i = $index) {
                  <div class="strategy-item">
                    <div class="strategy-item-head">
                      <span class="strategy-item-name">{{ i + 1 }}. {{ item.strategy }}</span>
                      <span class="strategy-score">{{ item.confidenceScore }}%</span>
                    </div>
                    @if (item.risk) {
                      <div class="strategy-risk" [class.low]="isLowRisk(item.risk)">
                        {{ item.risk }}
                      </div>
                    }
                    <div class="strategy-body">{{ item.reason }}</div>
                    @if (item.executionHint) {
                      <div class="strategy-body">Execution: {{ item.executionHint }}</div>
                    }
                  </div>
                }
              }
            </article>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      .strategy-tab {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 4px 2px 8px;
      }

      .strategy-tabs {
        display: inline-flex;
        gap: 6px;
        padding: 4px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface) 88%, var(--bg));
        width: fit-content;
      }

      .strategy-tab-btn {
        border: 0;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.68rem;
        font-weight: 700;
        color: var(--muted);
        background: transparent;
        cursor: pointer;
      }

      .strategy-tab-btn.active {
        color: var(--text);
        background: color-mix(in srgb, var(--option) 16%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--option) 25%, transparent);
      }

      .strategy-empty {
        text-align: center;
        padding: 20px 16px;
      }

      .strategy-empty-title {
        margin: 0 0 6px;
        font-size: 0.78rem;
        font-weight: 650;
        color: var(--text);
      }

      .strategy-empty-sub {
        margin: 0;
        font-size: 0.68rem;
        line-height: 1.45;
      }

      .strategy-mode-pill {
        flex-shrink: 0;
        font-size: 0.56rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 999px;
        color: var(--option);
        border: 1px solid color-mix(in srgb, var(--option) 35%, transparent);
        background: color-mix(in srgb, var(--option) 10%, transparent);
      }

      .strategy-conviction-meter {
        margin: 4px 0 10px;
      }

      .strategy-conviction-track {
        position: relative;
        height: 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--border) 80%, transparent);
        overflow: hidden;
      }

      .strategy-conviction-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--pe) 70%, transparent),
          color-mix(in srgb, var(--option) 75%, transparent)
        );
        transition: width 0.35s ease;
      }

      .strategy-conviction-fill.at-entry {
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--option) 65%, transparent),
          color-mix(in srgb, var(--ce) 80%, transparent)
        );
      }

      .strategy-conviction-marker {
        position: absolute;
        top: -2px;
        bottom: -2px;
        width: 2px;
        margin-left: -1px;
        background: var(--text);
        opacity: 0.55;
        border-radius: 1px;
      }

      .strategy-conviction-legend {
        display: flex;
        justify-content: space-between;
        margin-top: 4px;
        font-size: 0.56rem;
        color: var(--muted);
      }

      .strategy-guidance-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }

      .strategy-consider-badge {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
      }

      .strategy-consider-badge.yes {
        color: var(--ce);
        border-color: color-mix(in srgb, var(--ce) 40%, transparent);
        background: color-mix(in srgb, var(--ce) 12%, transparent);
      }

      .strategy-consider-badge.no {
        color: var(--muted);
        border-color: var(--border);
        background: color-mix(in srgb, var(--surface) 90%, var(--bg));
      }

      .strategy-threshold-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }

      .strategy-threshold-chip {
        font-size: 0.58rem;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--muted);
        background: color-mix(in srgb, var(--surface) 85%, var(--bg));
      }

      .strategy-threshold-chip.warn {
        color: #fde68a;
        border-color: color-mix(in srgb, #fbbf24 35%, transparent);
      }
    `,
  ],
})
export class StrategyPanelComponent {
  @Input() strategy: DeckStrategyPayload | null | undefined;

  readonly activeTab = signal<'pa' | 'options'>('pa');

  readonly paStrategies = () =>
    this.strategy?.priceActionStrategies?.length
      ? this.strategy.priceActionStrategies
      : this.strategy?.strategies ?? [];

  readonly optionStrategies = () =>
    this.strategy?.optionStrategies?.length
      ? this.strategy.optionStrategies
      : this.strategy?.strategies ?? [];

  actionPillClass(action: string): string {
    if (action === 'CE-BUY') return 'action-ce';
    if (action === 'PE-BUY') return 'action-pe';
    return '';
  }

  enterThreshold(): number {
    return this.strategy?.tradeGuidance?.thresholds?.enter ?? 60;
  }

  convictionWidth(): number {
    const conviction = this.strategy?.conviction ?? 0;
    return Math.max(0, Math.min(100, conviction));
  }

  weightPct(weight: number): number {
    return Math.round(weight * 100);
  }

  isLowRisk(risk: string): boolean {
    return risk.toLowerCase().includes('low') || risk.toLowerCase().includes('defined');
  }
}
