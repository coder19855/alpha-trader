import { Component } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-signal-readout-help',
  standalone: true,
  imports: [MatExpansionModule, MatIconModule],
  template: `
    <mat-accordion class="signal-readout-accordion" displayMode="flat">
      <mat-expansion-panel class="signal-readout-panel">
        <mat-expansion-panel-header class="signal-readout-header">
          <mat-panel-title class="signal-readout-title">
            <mat-icon aria-hidden="true">info_outline</mat-icon>
            <span>How to read — price action</span>
          </mat-panel-title>
        </mat-expansion-panel-header>

        <div class="signal-readout-body">
          <p class="signal-readout-lead">
            Read top to bottom. <strong>Action</strong> and <strong>entry %</strong> decide
            whether to trade; everything else is context.
          </p>

          <dl class="signal-readout-list">
            <div class="signal-readout-item">
              <dt>Action</dt>
              <dd>
                <code>NO-TRADE</code>, <code>CE-BUY</code>, or <code>PE-BUY</code> — your trade
                call. Do not enter if action is <code>NO-TRADE</code> or the chart veto banner is
                on.
              </dd>
            </div>
            <div class="signal-readout-item">
              <dt>Entry % / threshold</dt>
              <dd>
                e.g. <strong>25% / 60%</strong> — final conviction vs the minimum for your style
                (Intraday = 60%). Both must pass to enter.
              </dd>
            </div>
            <div class="signal-readout-item">
              <dt>Bias</dt>
              <dd>
                e.g. <strong>Moderate Bullish</strong> — a soft structural lean. Context only; not
                an entry signal and can disagree with action.
              </dd>
            </div>
            <div class="signal-readout-item">
              <dt>Needle</dt>
              <dd>
                e.g. <strong>0.00 FLAT</strong> — direction from the primary TF score (−1 bearish
                … +1 bullish). <code>FLAT</code> means between −0.35 and +0.35 (no clear CE/PE
                lean).
              </dd>
            </div>
            <div class="signal-readout-item">
              <dt>PA % bar</dt>
              <dd>
                e.g. <strong>10%</strong> — structural strength <em>before</em> entry bonuses. A
                low bar means a weak setup.
              </dd>
            </div>
            <div class="signal-readout-item">
              <dt>Bonuses</dt>
              <dd>
                e.g. <strong>10% base → 25% entry</strong> — MTF alignment (+10), ADX (+5), etc.
                add to the base for the final entry %.
              </dd>
            </div>
          </dl>

          <div class="signal-readout-example" role="note">
            <span class="signal-readout-example-label">Example</span>
            <p>
              <code>NO-TRADE</code> · <strong>25%/60%</strong> · Moderate Bullish · FLAT needle
            </p>
            <p>
              Slight bullish lean, but structure is too weak to enter. Wait until entry ≥
              60%, the needle moves past ±0.35, and the veto banner clears.
            </p>
          </div>

          <p class="signal-readout-note">
            Header price updates live via WebSocket. Signal scores recompute about every 60s
            (and on major quote moves), using historical candles patched with the live LTP. Check
            <strong>Signal calculated</strong> under the action card for the exact timestamp.
          </p>
        </div>
      </mat-expansion-panel>
    </mat-accordion>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-bottom: 12px;
      }

      .signal-readout-accordion {
        display: block;
      }

      .signal-readout-panel {
        background: rgba(34, 211, 238, 0.05) !important;
        border: 1px solid rgba(34, 211, 238, 0.22) !important;
        border-radius: 10px !important;
        box-shadow: none !important;
      }

      .signal-readout-header {
        padding: 0 12px;
        min-height: 40px !important;
        height: 40px !important;
        font-size: 0.78rem;
      }

      .signal-readout-header:hover {
        background: rgba(34, 211, 238, 0.06) !important;
      }

      .signal-readout-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--option, #22d3ee);
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .signal-readout-title mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }

      .signal-readout-body {
        padding: 2px 4px 12px;
        font-size: 0.74rem;
        line-height: 1.5;
        color: var(--text, #e8ecf1);
      }

      .signal-readout-lead {
        margin: 0 0 12px;
        color: var(--muted);
      }

      .signal-readout-list {
        margin: 0;
        display: grid;
        gap: 10px;
      }

      .signal-readout-item {
        margin: 0;
      }

      .signal-readout-item dt {
        margin: 0 0 2px;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--option, #22d3ee);
      }

      .signal-readout-item dd {
        margin: 0;
        color: var(--muted);
      }

      .signal-readout-item code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.68rem;
        color: var(--text, #e8ecf1);
        background: rgba(255, 255, 255, 0.06);
        padding: 1px 5px;
        border-radius: 4px;
      }

      .signal-readout-example {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px dashed var(--border);
        background: rgba(22, 26, 32, 0.55);
      }

      .signal-readout-example-label {
        display: block;
        margin-bottom: 6px;
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--pa, #fbbf24);
      }

      .signal-readout-example p {
        margin: 0 0 6px;
        color: var(--muted);
      }

      .signal-readout-example p:last-child {
        margin-bottom: 0;
      }

      .signal-readout-note {
        margin: 12px 0 0;
        font-size: 0.68rem;
        color: var(--muted);
        font-style: italic;
      }
    `,
  ],
})
export class SignalReadoutHelpComponent {}