import { Component } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-components-help',
  standalone: true,
  imports: [MatExpansionModule, MatIconModule],
  template: `
    <mat-accordion class="components-accordion" displayMode="flat">
      <mat-expansion-panel class="components-panel">
        <mat-expansion-panel-header class="components-header">
          <mat-panel-title class="components-title">
            <mat-icon aria-hidden="true">info_outline</mat-icon>
            <span>How to read</span>
          </mat-panel-title>
        </mat-expansion-panel-header>

        <div class="components-body">
          <p class="components-lead">
            Aligns with the Signal "How to read". The components break down why the
            gauge is bullish, bearish or flat. Read top to bottom. Use alongside the
            main Signal card: strong components in the same direction as the Action
            increase conviction. Conflicting components can act as soft vetoes.
          </p>
          <p class="components-lead">
            The list shows individual signals that make up the
            <strong>Price Action</strong> or <strong>Option</strong> gauge. Read
            top → bottom; the bipolar <strong>value</strong>
            (−1 … +1) is the primary directional cue.
          </p>

          <dl class="components-list">
            <div class="components-item">
              <dt>Label</dt>
              <dd>
                The human name for the component (e.g. ADX, Momentum, Support).
              </dd>
            </div>
            <div class="components-item">
              <dt>Value</dt>
              <dd>
                Directional score on a bipolar scale:
                <strong>−1</strong> bearish · <strong>0</strong> flat ·
                <strong>+1</strong> bullish. Closer to ±1 means stronger
                directional signal.
              </dd>
            </div>
            <div class="components-item">
              <dt>Weight</dt>
              <dd>
                Relative importance used when aggregating components into the
                gauge.
              </dd>
            </div>
            <div class="components-item">
              <dt>Interpretation</dt>
              <dd>
                Short text summarising why the component scored that way
                (context).
              </dd>
            </div>
            <div class="components-item">
              <dt>Readout</dt>
              <dd>
                Numeric or textual detail shown alongside the label (e.g.
                <em>ADX: 28</em>).
              </dd>
            </div>
            <div class="components-item">
              <dt>Group</dt>
              <dd>
                Either <strong>priceAction</strong> or <strong>option</strong> —
                which gauge it feeds.
              </dd>
            </div>
          </dl>

          <div class="components-example" role="note">
            <span class="components-example-label">Example</span>
            <p>
              <strong>ADX</strong> · Value <strong>+0.65</strong> · Weight
              <strong>0.8</strong> · Interpretation:
              <em>Strong trending momentum</em> — this pulls the gauge more
              bullish.
            </p>
          </div>

          <p class="components-note">
            Tip: use the <strong>Breakdown</strong> button to open the drilldown
            for per-component details (raw numbers and textual readouts).
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

      .components-accordion {
        display: block;
      }

      .components-panel {
        background: color-mix(in srgb, var(--option) 6%, var(--surface)) !important;
        border: 1px solid color-mix(in srgb, var(--option) 18%, var(--border)) !important;
        border-radius: 10px !important;
        box-shadow: none !important;
      }

      .components-header {
        padding: 0 12px;
        min-height: 40px !important;
        height: 40px !important;
        font-size: 0.78rem;
      }

      .components-header:hover {
        background: color-mix(in srgb, var(--option) 8%, transparent) !important;
      }

      .components-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--option);
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .components-title mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }

      .components-body {
        padding: 2px 4px 12px;
        font-size: 0.74rem;
        line-height: 1.5;
        color: var(--text);
      }

      .components-lead {
        margin: 0 0 12px;
        color: var(--muted);
      }

      .components-list {
        margin: 0;
        display: grid;
        gap: 10px;
      }

      .components-item dt {
        margin: 0 0 2px;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--option);
      }

      .components-item dd {
        margin: 0;
        color: var(--muted);
      }

      .components-example {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px dashed var(--border);
        background: color-mix(in srgb, var(--surface) 88%, var(--bg));
      }

      .components-example-label {
        display: block;
        margin-bottom: 6px;
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--option);
      }

      .components-note {
        margin: 12px 0 0;
        font-size: 0.68rem;
        color: var(--muted);
        font-style: italic;
      }
    `,
  ],
})
export class ComponentsHelpComponent {}
