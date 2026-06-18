import { NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DeckAlertService } from '../../core/services/deck-alert.service';

@Component({
  selector: 'app-toast-stack',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="toast-stack" aria-live="polite" aria-relevant="additions">
      @for (toast of alerts.toasts(); track toast.id) {
        <article class="toast-card" [ngClass]="'toast-' + toast.kind">
          <div class="toast-card-head">
            <span class="toast-kind-dot" aria-hidden="true"></span>
            <h3 class="toast-title">{{ toast.title }}</h3>
            <button
              type="button"
              class="toast-dismiss"
              aria-label="Dismiss notification"
              (click)="alerts.dismiss(toast.id)"
            >
              ×
            </button>
          </div>
          <p class="toast-message">{{ toast.message }}</p>
        </article>
      }
    </div>
  `,
})
export class ToastStackComponent {
  readonly alerts = inject(DeckAlertService);
}