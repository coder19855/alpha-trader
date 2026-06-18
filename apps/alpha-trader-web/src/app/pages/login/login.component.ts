import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  template: `
    <div class="login-page">
      <div class="web-modal-card login-card">
        <div class="login-brand">
          <img src="brand-mark.svg" width="48" height="48" alt="" />
          <div>
            <h1 class="login-brand-title">Alpha Trader</h1>
            <p class="login-brand-tag">Bull · Bear · Benchmark</p>
          </div>
        </div>
        <h2>Fyers login</h2>
        <p>
          Alpha Trader stores one Fyers access token on the server (~24h). Complete OAuth once,
          then use the live deck, replay, and benchmark in your browser.
        </p>
        @if (hasToken()) {
          <p class="settings-status ok">Fyers session is active. Continue to the app.</p>
          <div class="web-modal-actions">
            <button mat-flat-button color="primary" type="button" (click)="goApp()">
              Open Alpha Trader
            </button>
          </div>
        } @else {
          <p class="settings-status err">Fyers session is missing or expired.</p>
          <div class="web-modal-actions">
            <button mat-flat-button color="primary" type="button" (click)="connect()">
              Connect Fyers
            </button>
          </div>
        }
        <p class="settings-mode-note">
          Token still failing?
          <button type="button" class="login-cta" (click)="forceRefresh()">Force refresh</button>
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      .login-page {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 20px;
        background: var(--bg);
      }

      .login-card {
        width: min(26rem, 92vw);
      }

      .login-brand {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 1.25rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border);
      }

      .login-brand-title {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      .login-brand-tag {
        margin: 0.2rem 0 0;
        font-size: 0.72rem;
        color: var(--muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .login-card h2 {
        margin: 0 0 0.5rem;
      }

      .web-modal-actions {
        justify-content: stretch;
      }

      .web-modal-actions button {
        flex: 1;
      }

      :host ::ng-deep .mat-mdc-button.mat-primary {
        --mdc-filled-button-container-color: var(--accent);
        --mdc-filled-button-label-text-color: #0d0f12;
      }
    `,
  ],
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  readonly hasToken = signal(false);

  ngOnInit(): void {
    this.auth.checkLogin().subscribe({
      next: (res) => this.hasToken.set(Boolean(res.hasActiveToken)),
      error: () => {
        this.hasToken.set(false);
        this.notify.warn('Could not verify Fyers session');
      },
    });
  }

  connect(): void {
    this.auth.startBrowserLogin('/');
  }

  forceRefresh(): void {
    this.auth.forceRelogin('/');
  }

  goApp(): void {
    void this.router.navigate(['/']);
  }
}