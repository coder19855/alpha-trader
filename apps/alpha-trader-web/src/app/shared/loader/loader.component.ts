import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./loader.component.scss'],
  template: `
    <div class="loading-overlay" role="status" aria-live="polite">
      <div class="loader-card">
        <div class="logo-wrap" aria-hidden="true">
          <svg
            class="logo-spin"
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="g" x1="0" x2="1">
                <stop offset="0" stop-color="#22d3ee" />
                <stop offset="1" stop-color="#7c3aed" />
              </linearGradient>
            </defs>
            <circle
              cx="24"
              cy="24"
              r="18"
              stroke="url(#g)"
              stroke-width="3"
              stroke-linecap="round"
              fill="none"
              stroke-dasharray="85"
              stroke-dashoffset="15"
            />
          </svg>
        </div>

        <div class="loader-texts">
          <div class="loading-text">
            @if (message) {
              {{ message }}
            } @else {
              Loading…
            }
          </div>
          @if (sub) {
            <div class="loading-sub">{{ sub }}</div>
          }
        </div>

        @if (progress !== null && progress !== undefined) {
          <div class="progress-wrap">
            <div class="progress-track">
              <div class="progress-fill" [style.width]="progress + '%'"></div>
            </div>
            <div class="progress-percent">{{ progress }}%</div>
          </div>
        }
      </div>
    </div>
  `,
})
export class LoaderComponent {
  @Input() message?: string;
  @Input() sub?: string;
  @Input() progress?: number | null = null;
}
