import { Component } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-option-chain-readout-help',
  standalone: true,
  imports: [MatExpansionModule, MatIconModule],
  template: `
    <mat-accordion class="oc-readout-accordion" displayMode="flat">
      <mat-expansion-panel class="oc-readout-panel">
        <mat-expansion-panel-header class="oc-readout-header">
          <mat-panel-title class="oc-readout-title">
            <mat-icon aria-hidden="true">info_outline</mat-icon>
            <span>How to read — option chain</span>
          </mat-panel-title>
        </mat-expansion-panel-header>

        <div class="oc-readout-body">
          <p class="oc-readout-lead">
            Read top to bottom. Option flow is <strong>independent</strong> of price-action
            entry %. Use it to <strong>confirm</strong> or <strong>veto</strong> the PA
            direction — never as a standalone entry trigger.
          </p>

          <p class="oc-readout-section">Signal card</p>
          <dl class="oc-readout-list">
            <div class="oc-readout-item">
              <dt>Flow signal</dt>
              <dd>
                <code>BULLISH FLOW</code>, <code>BEARISH FLOW</code>, or
                <code>NEUTRAL FLOW</code> — the weighted verdict from all eight components
                below. Threshold depends on style (Intraday ≈ ±28, Scalper ≈ ±22, Positional
                ≈ ±35 on the internal −100…+100 scale).
                <span class="oc-readout-ex">
                  e.g. composite <strong>+34</strong> on Intraday →
                  <code>BULLISH FLOW</code>; <strong>−12</strong> →
                  <code>NEUTRAL FLOW</code> (below threshold).
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Flow %</dt>
              <dd>
                0–100% strength of the chain bias. Higher = stronger lean, but it does
                <em>not</em> replace PA entry threshold.
                <span class="oc-readout-ex">
                  e.g. <strong>68%</strong> with <code>BULLISH FLOW</code> = confident CE lean;
                  <strong>22%</strong> with <code>NEUTRAL FLOW</code> = weak / mixed chain.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Bias · IV regime</dt>
              <dd>
                Soft text label under the card. <strong>Bias</strong> mirrors flow strength
                (Moderate / Strong). <strong>IV regime</strong> summarises whether options are
                cheap, normal, or expensive to buy right now.
                <span class="oc-readout-ex">
                  e.g. <strong>Moderate Bullish · Elevated IV</strong> — bullish flow but
                  premiums are rich; size carefully.
                </span>
              </dd>
            </div>
          </dl>

          <p class="oc-readout-section">Needle &amp; flow bar</p>
          <dl class="oc-readout-list">
            <div class="oc-readout-item">
              <dt>Needle (−1 … +1)</dt>
              <dd>
                Composite score mapped to a bipolar dial. Right of centre = CE lean; left = PE
                lean. Label shows <code>CE</code>, <code>PE</code>, or <code>FLAT</code>
                (between −0.35 and +0.35).
                <span class="oc-readout-ex">
                  e.g. needle at <strong>+0.52 CE</strong> — clear bullish chain; at
                  <strong>−0.18 FLAT</strong> — mixed, no strong side.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Flow % bar</dt>
              <dd>
                Same conviction as the card, shown as a 0–100% lane under the needle. Does not
                change your PA entry %.
              </dd>
            </div>
          </dl>

          <p class="oc-readout-section">Confirm / veto banner</p>
          <dl class="oc-readout-list">
            <div class="oc-readout-item">
              <dt>Green confirm</dt>
              <dd>
                PA action and option flow agree (e.g. PA <code>CE-BUY</code> + bullish flow).
                Helpful tailwind in <strong>strict</strong> chart-veto mode.
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Red veto</dt>
              <dd>
                PA wants one side but chain favours the other (e.g. PA
                <code>CE-BUY</code> + bearish flow). In <strong>strict</strong> mode this
                blocks the PA entry. <strong>Relaxed</strong> shows a soft warning;
                <strong>off</strong> hides alignment checks.
              </dd>
            </div>
          </dl>

          <p class="oc-readout-section">Widget cards</p>
          <dl class="oc-readout-list">
            <div class="oc-readout-item">
              <dt>OI balance</dt>
              <dd>
                Total open-interest split: <strong>sky = calls</strong>, <strong>lavender =
                puts</strong> (contract type, not direction). <strong>PCR</strong> in the
                header is put OI ÷ call OI for the whole chain.
                <span class="oc-readout-ex">
                  e.g. PCR <strong>1.35</strong> (more put OI) often means hedging / defensive
                  positioning; PCR <strong>0.78</strong> (more call OI) leans bullish.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Volatility (skew + VIX)</dt>
              <dd>
                <strong>IV skew</strong> = ATM put IV minus call IV. Positive (red) = puts
                pricier → downside protection in demand. Negative (green) = calls relatively
                expensive. <strong>India VIX</strong> is index fear gauge: &lt;12 calm, 12–16
                normal, 16–20 elevated, &gt;20 fear.
                <span class="oc-readout-ex">
                  e.g. skew <strong>+1.4</strong> + VIX <strong>18.2</strong> — cautious
                  positioning; not ideal for aggressive CE buys unless PA is very strong.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Max pain</dt>
              <dd>
                Strike where option writers face minimum payout at expiry. Spot <em>above</em>
                pain → mild pull-down bias; <em>below</em> → mild pull-up; within ~20 pts →
                pinning zone.
                <span class="oc-readout-ex">
                  e.g. spot <strong>24,580</strong>, max pain <strong>24,500</strong> (+80 pts)
                  → slight gravity toward pain (mild bearish drift intraday).
                </span>
              </dd>
            </div>
          </dl>

          <p class="oc-readout-section">ATM Greeks</p>
          <dl class="oc-readout-list">
            <div class="oc-readout-item">
              <dt>Per-leg bars</dt>
              <dd>
                Live greeks for ATM <code>CE</code> and <code>PE</code>. Bar length = relative
                size; orange = negative (theta decay).
                <span class="oc-readout-ex">
                  <strong>Δ delta</strong> — how much option moves per ₹1 spot move (CE ~0.45
                  ATM). <strong>Γ gamma</strong> — how fast delta changes (highest ATM).
                  <strong>Θ theta</strong> — daily time decay (always negative for buyers).
                  <strong>ν vega</strong> — sensitivity to IV. <strong>IV</strong> — implied
                  vol %. <strong>OI Δ</strong> — today's OI change on that strike (cyan =
                  build, orange = unwind).
                </span>
              </dd>
            </div>
          </dl>

          <p class="oc-readout-section">OI Guard</p>
          <dl class="oc-readout-list">
            <div class="oc-readout-item">
              <dt>Strike walls &amp; ladder</dt>
              <dd>
                Highlights heavy OI strikes near spot. <strong>Call resistance</strong> /
                <strong>Put support</strong> walls filter the ladder. <strong>Call</strong> (sky)
                and <strong>Put</strong> (lavender) pills are contract labels only — not
                bullish/bearish colours. OI Δ cyan = writers adding; orange = unwinding. Tap
                the flow icon for a writer-side summary (premium, OI, spot impact).
                <span class="oc-readout-ex">
                  e.g. OTM call OI building at <strong>24,600</strong> with spot 24,550 — writers
                  defending upside; put OI unwind below spot can thin downside support.
                </span>
              </dd>
            </div>
          </dl>

          <p class="oc-readout-section">Score components (Components tab)</p>
          <p class="oc-readout-hint">
            Each row uses the same bipolar scale: <strong>−1</strong> bearish ·
            <strong>0</strong> flat · <strong>+1</strong> bullish. Weight varies by trading
            style (OI &amp; trend matter more for Scalper; PCR, pain &amp; skew more for
            Positional).
          </p>
          <dl class="oc-readout-list">
            <div class="oc-readout-item">
              <dt>Open interest</dt>
              <dd>
                Net OI <em>build</em> near ATM today. More fresh call OI than put OI → positive;
                put build dominates → negative.
                <span class="oc-readout-ex">
                  e.g. near ATM: CE OI Δ <strong>+14k</strong>, PE OI Δ <strong>+3k</strong> →
                  <strong>+0.55</strong> (call writers adding risk above spot).
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Trend</dt>
              <dd>
                Direction of <em>today's</em> OI changes. CE OI rising + PE OI falling = bullish;
                opposite = bearish. Unwinds on one side count toward the other.
                <span class="oc-readout-ex">
                  e.g. CE building, puts unwinding → <strong>+0.40</strong> intraday bullish
                  flow confirmation.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Greeks</dt>
              <dd>
                OI-weighted net delta near ATM. Positive = net long-delta positioning (bullish
                dealer hedge pressure); negative = net short-delta (bearish).
                <span class="oc-readout-ex">
                  e.g. heavy ATM call OI with delta ~0.5 → <strong>+0.30</strong> moderate
                  bullish greeks score.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>PCR</dt>
              <dd>
                Put OI ÷ call OI for the full chain, scored for direction. High PCR (&gt;1.1) →
                bearish (defensive puts); low PCR (&lt;0.9) → bullish.
                <span class="oc-readout-ex">
                  e.g. PCR <strong>1.42</strong> → <strong>−0.35</strong> moderate bearish; PCR
                  <strong>0.72</strong> → <strong>+0.45</strong> moderate bullish.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Implied vol</dt>
              <dd>
                ATM IV <em>level</em> — whether options are cheap or expensive to buy (not spot
                direction). Low IV → positive (favourable for new longs); very high IV →
                negative (rich premiums, harder R:R).
                <span class="oc-readout-ex">
                  e.g. ATM IV <strong>11%</strong> → <strong>+0.55</strong> cheap options; IV
                  <strong>26%</strong> → <strong>−0.35</strong> expensive environment.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Max pain</dt>
              <dd>
                Where spot sits vs the pain strike. Above pain → negative (gravity down); below
                → positive (gravity up); near pain → neutral pinning.
                <span class="oc-readout-ex">
                  e.g. spot 80 pts above pain → <strong>−0.25</strong> mild pull-down bias into
                  expiry week.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>VIX</dt>
              <dd>
                India VIX fear level. Calm VIX (&lt;12) scores positive; elevated / panic VIX
                scores negative — harder environment for calm directional entries.
                <span class="oc-readout-ex">
                  e.g. VIX <strong>11.5</strong> → slight positive; VIX <strong>22</strong> →
                  <strong>−0.40</strong> high-fear headwind.
                </span>
              </dd>
            </div>
            <div class="oc-readout-item">
              <dt>Skew</dt>
              <dd>
                Put IV minus call IV at ATM. Positive skew (puts pricier) → bearish hedging
                demand; negative skew → call-side demand.
                <span class="oc-readout-ex">
                  e.g. skew <strong>+1.8</strong> → <strong>−0.22</strong> moderate bearish;
                  skew <strong>−0.6</strong> → <strong>+0.08</strong> slight bullish.
                </span>
              </dd>
            </div>
          </dl>

          <div class="oc-readout-example" role="note">
            <span class="oc-readout-example-label">Worked example</span>
            <p>
              PA: <code>CE-BUY</code> · Option:
              <code>BULLISH FLOW</code> <strong>64%</strong> · needle <strong>+0.48 CE</strong>
            </p>
            <p>
              Components: OI <strong>+0.50</strong>, Trend <strong>+0.35</strong>, PCR
              <strong>+0.20</strong>, Greeks <strong>+0.28</strong> — chain agrees with CE.
              Skew <strong>−0.15</strong> and pain <strong>−0.18</strong> are minor headwinds.
              Green <strong>confirm</strong> banner in strict mode. Still need PA entry ≥
              threshold and no chart veto before entering.
            </p>
            <p>
              Counter-example: PA <code>CE-BUY</code> but <code>BEARISH FLOW</code>
              <strong>58%</strong>, needle <strong>−0.41 PE</strong>, PCR <strong>−0.40</strong>,
              heavy put wall at spot → red <strong>veto</strong> in strict mode; stand down or
              wait for alignment.
            </p>
          </div>

          <p class="oc-readout-note">
            Data auto-refreshes per Settings (pauses outside 09:15–15:30 IST). Use the
            <strong>refresh icon</strong> top-right for an on-demand fetch. Open
            <strong>Components</strong> (under Veto in the sidebar) for the per-component
            breakdown.
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
      .oc-readout-panel {
        background: rgba(167, 139, 250, 0.06) !important;
        border: 1px solid rgba(167, 139, 250, 0.28) !important;
        border-radius: 10px !important;
        box-shadow: none !important;
      }
      .oc-readout-header {
        padding: 0 12px;
        min-height: 40px !important;
        height: 40px !important;
        font-size: 0.78rem;
      }
      .oc-readout-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #c4b5fd;
        font-weight: 600;
      }
      .oc-readout-title mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }
      .oc-readout-body {
        padding: 2px 4px 12px;
        font-size: 0.74rem;
        line-height: 1.5;
        color: var(--text, #e8ecf1);
      }
      .oc-readout-lead {
        margin: 0 0 12px;
        color: var(--muted);
      }
      .oc-readout-section {
        margin: 14px 0 8px;
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #a78bfa;
      }
      .oc-readout-section:first-of-type {
        margin-top: 0;
      }
      .oc-readout-hint {
        margin: 0 0 10px;
        font-size: 0.68rem;
        color: var(--muted);
      }
      .oc-readout-list {
        margin: 0;
        display: grid;
        gap: 10px;
      }
      .oc-readout-item dt {
        margin: 0 0 2px;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #c4b5fd;
      }
      .oc-readout-item dd {
        margin: 0;
        color: var(--muted);
      }
      .oc-readout-item code {
        font-family: ui-monospace, monospace;
        font-size: 0.68rem;
        color: var(--text);
        background: rgba(255, 255, 255, 0.06);
        padding: 1px 5px;
        border-radius: 4px;
      }
      .oc-readout-ex {
        display: block;
        margin-top: 5px;
        padding-left: 8px;
        border-left: 2px solid rgba(167, 139, 250, 0.35);
        font-size: 0.68rem;
        color: var(--muted);
      }
      .oc-readout-example {
        margin-top: 14px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px dashed rgba(167, 139, 250, 0.35);
        background: rgba(22, 26, 32, 0.55);
      }
      .oc-readout-example-label {
        display: block;
        margin-bottom: 6px;
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #fbbf24;
      }
      .oc-readout-example p {
        margin: 0 0 6px;
        color: var(--muted);
      }
      .oc-readout-example p:last-child {
        margin-bottom: 0;
      }
      .oc-readout-note {
        margin: 12px 0 0;
        font-size: 0.68rem;
        color: var(--muted);
        font-style: italic;
      }
    `,
  ],
})
export class OptionChainReadoutHelpComponent {}