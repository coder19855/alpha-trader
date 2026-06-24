import { Component, Input } from '@angular/core';
import { OptionPaAlignment } from '../../core/models/option-chain.models';

@Component({
  selector: 'app-signal-dual-lane',
  standalone: true,
  template: `
    <section class="signal-dual-lane" aria-label="Price action and option flow">
      <div class="dual-lane-grid">
        <article class="lane-card lane-pa">
          <header class="lane-head">
            <span class="lane-kicker">Price action</span>
            @if (paDirectionLabel) {
              <span class="lane-dir" [class.bull]="paDirection === 'bullish'" [class.bear]="paDirection === 'bearish'">
                {{ paDirectionLabel }}
              </span>
            }
          </header>
          <p class="lane-action">{{ paAction || '—' }}</p>
          <div class="lane-bar-row">
            <div class="lane-bar" aria-hidden="true">
              <div class="lane-fill pa" [style.width.%]="clampPercent(paConviction)"></div>
            </div>
            <span class="lane-pct">{{ clampPercent(paConviction) }}%</span>
          </div>
          @if (paBias) {
            <p class="lane-meta">{{ paBias }}</p>
          }
        </article>

        <article class="lane-card lane-option">
          <header class="lane-head">
            <span class="lane-kicker">Option flow</span>
            @if (optionLive) {
              <span class="lane-live-tag">live</span>
            }
            @if (optionDirectionLabel) {
              <span
                class="lane-dir"
                [class.bull]="optionDirection === 'bullish'"
                [class.bear]="optionDirection === 'bearish'"
              >
                {{ optionDirectionLabel }}
              </span>
            }
          </header>
          @if (optionLoading) {
            <p class="lane-action muted">Connecting…</p>
            <div class="lane-bar-row">
              <div class="lane-bar" aria-hidden="true">
                <div class="lane-fill option skeleton"></div>
              </div>
              <span class="lane-pct muted">—</span>
            </div>
          } @else if (hasOptionFlow) {
            <p class="lane-action">{{ optionSignalLabel }}</p>
            <div class="lane-bar-row">
              <div class="lane-bar" aria-hidden="true">
                <div
                  class="lane-fill option"
                  [style.width.%]="clampPercent(optionConviction!)"
                ></div>
              </div>
              <span class="lane-pct">{{ clampPercent(optionConviction!) }}%</span>
            </div>
            @if (optionBias) {
              <p class="lane-meta">{{ optionBias }}</p>
            }
          } @else {
            <p class="lane-action muted">No live flow</p>
            <div class="lane-bar-row">
              <div class="lane-bar" aria-hidden="true"></div>
              <span class="lane-pct muted">—</span>
            </div>
          }
        </article>
      </div>

      @if (showAlignmentBanner) {
        <p
          class="alignment-banner"
          role="status"
          [class.confirm]="paAlignment === 'confirm'"
          [class.veto]="paAlignment === 'veto'"
          [class.neutral]="paAlignment === 'neutral'"
        >
          <strong>{{ alignmentTitle }}</strong>
          @if (paAlignmentDetail) {
            <span> — {{ paAlignmentDetail }}</span>
          }
        </p>
      }

      <p class="dual-lane-footnote">
        @if (flowMode === 'pa-only') {
          Entry conviction uses <strong>price action only</strong>. Option flow is shown for
          confirmation — it does not change the PA entry %.
        } @else {
          Blended mode — both lanes contribute to entry conviction.
        }
      </p>
    </section>
  `,
  styles: [
    `
      .signal-dual-lane {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 10px;
        padding: 12px;
        border: 1px solid rgba(167, 139, 250, 0.22);
        border-radius: 12px;
        background: linear-gradient(
          135deg,
          rgba(167, 139, 250, 0.08),
          rgba(34, 211, 238, 0.05)
        );
      }
      .dual-lane-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      @media (max-width: 520px) {
        .dual-lane-grid {
          grid-template-columns: 1fr;
        }
      }
      .lane-card {
        padding: 10px 11px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: rgba(0, 0, 0, 0.18);
        min-width: 0;
      }
      .lane-pa {
        border-color: rgba(167, 139, 250, 0.28);
      }
      .lane-option {
        border-color: rgba(34, 211, 238, 0.22);
      }
      .lane-head {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 4px;
      }
      .lane-kicker {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .lane-pa .lane-kicker {
        color: #c4b5fd;
      }
      .lane-option .lane-kicker {
        color: var(--option);
      }
      .lane-live-tag {
        font-size: 0.56rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--option);
      }
      .lane-dir {
        font-size: 0.58rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--muted);
      }
      .lane-dir.bull {
        color: #4ade80;
        border-color: rgba(74, 222, 128, 0.35);
        background: rgba(74, 222, 128, 0.08);
      }
      .lane-dir.bear {
        color: #f87171;
        border-color: rgba(248, 113, 113, 0.35);
        background: rgba(248, 113, 113, 0.08);
      }
      .lane-action {
        margin: 0 0 8px;
        font-size: 0.92rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        line-height: 1.2;
        word-break: break-word;
      }
      .lane-action.muted,
      .lane-pct.muted {
        color: var(--muted);
        font-weight: 600;
      }
      .lane-bar-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
      }
      .lane-bar {
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        overflow: hidden;
      }
      .lane-fill {
        height: 100%;
        border-radius: inherit;
        transition: width 0.25s ease;
      }
      .lane-fill.pa {
        background: linear-gradient(90deg, #7c3aed, #c4b5fd);
      }
      .lane-fill.option {
        background: linear-gradient(90deg, #0891b2, #22d3ee);
      }
      .lane-fill.skeleton {
        width: 35%;
        opacity: 0.35;
        animation: lane-pulse 1.2s ease-in-out infinite;
      }
      @keyframes lane-pulse {
        0%,
        100% {
          opacity: 0.25;
        }
        50% {
          opacity: 0.55;
        }
      }
      .lane-pct {
        font-size: 0.72rem;
        font-weight: 700;
        min-width: 2.5rem;
        text-align: right;
      }
      .lane-meta {
        margin: 6px 0 0;
        font-size: 0.64rem;
        color: var(--muted);
        line-height: 1.35;
      }
      .alignment-banner {
        margin: 0;
        font-size: 0.72rem;
        line-height: 1.4;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        color: var(--muted);
        background: rgba(255, 255, 255, 0.03);
      }
      .alignment-banner strong {
        font-weight: 700;
      }
      .alignment-banner.confirm {
        color: #4ade80;
        border-color: rgba(74, 222, 128, 0.28);
        background: rgba(74, 222, 128, 0.08);
      }
      .alignment-banner.veto {
        color: #f87171;
        border-color: rgba(248, 113, 113, 0.3);
        background: rgba(248, 113, 113, 0.1);
      }
      .alignment-banner.neutral {
        color: #fbbf24;
        border-color: rgba(251, 191, 36, 0.28);
        background: rgba(251, 191, 36, 0.08);
      }
      .dual-lane-footnote {
        margin: 0;
        font-size: 0.62rem;
        color: var(--muted);
        line-height: 1.4;
      }
    `,
  ],
})
export class SignalDualLaneComponent {
  @Input() paAction = '';
  @Input() paConviction = 0;
  @Input() paBias = '';
  @Input() optionSignal: string | null = null;
  @Input() optionConviction: number | null = null;
  @Input() optionBias = '';
  @Input() paAlignment: OptionPaAlignment | null = null;
  @Input() paAlignmentDetail = '';
  @Input() optionLoading = false;
  @Input() optionLive = false;
  @Input() flowMode = 'pa-only';

  get hasOptionFlow(): boolean {
    return (
      this.optionSignal != null &&
      this.optionConviction != null &&
      Number.isFinite(this.optionConviction)
    );
  }

  get optionSignalLabel(): string {
    return formatOptionSignalLabel(this.optionSignal ?? '');
  }

  get paDirection(): 'bullish' | 'bearish' | 'neutral' {
    return directionFromPaAction(this.paAction);
  }

  get optionDirection(): 'bullish' | 'bearish' | 'neutral' {
    return directionFromOptionSignal(this.optionSignal ?? '');
  }

  get paDirectionLabel(): string | null {
    if (this.paDirection === 'bullish') return 'Bullish';
    if (this.paDirection === 'bearish') return 'Bearish';
    return null;
  }

  get optionDirectionLabel(): string | null {
    if (!this.hasOptionFlow) return null;
    if (this.optionDirection === 'bullish') return 'Bullish';
    if (this.optionDirection === 'bearish') return 'Bearish';
    return 'Flat';
  }

  get showAlignmentBanner(): boolean {
    return (
      this.hasOptionFlow &&
      this.paAlignment != null &&
      this.paAlignment !== 'skipped'
    );
  }

  get alignmentTitle(): string {
    if (this.paAlignment === 'confirm') return 'Aligned';
    if (this.paAlignment === 'veto') return 'Conflict';
    return 'Neutral';
  }

  clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(Math.max(0, Math.min(100, value)));
  }
}

export function formatOptionSignalLabel(signal: string): string {
  const raw = String(signal || '').toUpperCase();
  if (raw.includes('BULLISH')) return 'BULLISH FLOW';
  if (raw.includes('BEARISH')) return 'BEARISH FLOW';
  return 'NEUTRAL FLOW';
}

export function directionFromPaAction(
  action: string,
): 'bullish' | 'bearish' | 'neutral' {
  if (action === 'CE-BUY') return 'bullish';
  if (action === 'PE-BUY') return 'bearish';
  return 'neutral';
}

export function directionFromOptionSignal(
  signal: string,
): 'bullish' | 'bearish' | 'neutral' {
  const raw = String(signal || '').toUpperCase();
  if (raw.includes('BULLISH')) return 'bullish';
  if (raw.includes('BEARISH')) return 'bearish';
  return 'neutral';
}