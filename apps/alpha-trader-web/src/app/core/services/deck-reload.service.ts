import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

/** Cross-component hook: shell reload button → live deck reconnect + data refresh. */
@Injectable({ providedIn: 'root' })
export class DeckReloadService {
  private readonly requested$ = new Subject<void>();
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  readonly busy = signal(false);
  readonly requested = this.requested$.asObservable();

  request(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.clearFinishTimer();
    this.finishTimer = setTimeout(() => this.markFinished(), 12_000);
    this.requested$.next();
  }

  markFinished(): void {
    this.clearFinishTimer();
    this.busy.set(false);
  }

  private clearFinishTimer(): void {
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
  }
}