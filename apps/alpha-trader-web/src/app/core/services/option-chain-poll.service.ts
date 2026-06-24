import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { OptionChainSignalPayload } from '../models/option-chain.models';
import { TradingStyle } from '../models/deck.models';
import { OptionChainApiService } from './option-chain-api.service';

export interface OptionPollContext {
  symbol: string;
  style: TradingStyle;
  paAction?: string;
  moneyness?: '' | 'ATM' | 'OTM' | 'ITM';
  enabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class OptionChainPollService {
  private readonly api = inject(OptionChainApiService);

  readonly data = signal<OptionChainSignalPayload | null>(null);
  /** True only for initial load or explicit refresh/prefetch — not background polls. */
  readonly loading = signal(false);

  readonly error = signal<string | null>(null);

  private sub: Subscription | null = null;
  private ctx: OptionPollContext | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingReconnect = false;
  private reconnectListenersAttached = false;
  private closed = false;
  private sourceActive = false;

  private scheduleKey(ctx: OptionPollContext): string {
    return `${ctx.symbol}|${ctx.style}|${ctx.moneyness ?? ''}|${ctx.paAction ?? ''}`;
  }

  private clearReconnectTimer(): void {
   if (this.reconnectTimer) {
     clearTimeout(this.reconnectTimer);
     this.reconnectTimer = null;
   }
  }

  private detachReconnectListeners(): void {
   if (!this.reconnectListenersAttached) return;
   window.removeEventListener('focus', this.handleFocus);
   document.removeEventListener('visibilitychange', this.handleVisibilityChange);
   this.reconnectListenersAttached = false;
  }

  private handleFocus = (): void => {
   if (this.closed || this.sourceActive || !this.awaitingReconnect) return;
   if (document.visibilityState === 'visible' && document.hasFocus()) {
     this.clearReconnectTimer();
     this.connectSource();
   }
  };

  private handleVisibilityChange = (): void => {
   if (this.closed || this.sourceActive || !this.awaitingReconnect) return;
   if (document.visibilityState === 'visible' && document.hasFocus()) {
     this.clearReconnectTimer();
     this.connectSource();
   }
  };

  private scheduleReconnect(): void {
   if (this.closed || this.sourceActive || this.awaitingReconnect) return;
   this.awaitingReconnect = true;
   if (!this.reconnectListenersAttached) {
     window.addEventListener('focus', this.handleFocus);
     document.addEventListener('visibilitychange', this.handleVisibilityChange);
     this.reconnectListenersAttached = true;
   }
   if (document.visibilityState === 'visible' && document.hasFocus()) {
     this.reconnectTimer = setTimeout(() => this.connectSource(), 1500);
   }
  }

  private connectSource(): void {
   if (this.closed || this.sourceActive || !this.ctx) return;
   const query = {
     symbol: this.ctx.symbol,
     style: this.ctx.style,
     paAction: this.ctx.paAction,
   };

   if (!this.data()) {
     this.loading.set(true);
   }
   this.error.set(null);
   this.sourceActive = true;
   this.sub = this.api.stream(query).subscribe({
     next: (payload) => {
       this.data.set(payload);
       this.loading.set(false);
     },
     error: (err) => {
       this.sourceActive = false;
       const message =
         err instanceof Error ? err.message : 'Option chain stream disconnected';
       this.loading.set(false);
       this.error.set(message);
       this.scheduleReconnect();
     },
   });
  }

  configure(ctx: OptionPollContext): void {
   if (!ctx.enabled) {
     this.stop();
     return;
   }

   const prev = this.ctx;
   const sameSchedule =
     prev != null && this.scheduleKey(prev) === this.scheduleKey(ctx);
   this.ctx = ctx;

   if (sameSchedule && this.sourceActive) {
     return;
   }

   this.sub?.unsubscribe();
   this.sub = null;
   this.sourceActive = false;
   this.awaitingReconnect = false;
   this.clearReconnectTimer();
   this.detachReconnectListeners();
   this.connectSource();
  }

  refresh(force = true): void {
   if (!this.ctx) return;
   if (force) {
     this.loading.set(true);
     this.error.set(null);
   }
   this.sub?.unsubscribe();
   this.sub = null;
   this.sourceActive = false;
   this.awaitingReconnect = false;
   this.clearReconnectTimer();
   this.detachReconnectListeners();
   this.connectSource();
  }

  stop(): void {
   this.ctx = null;
   this.closed = true;
   this.sub?.unsubscribe();
   this.sub = null;
   this.sourceActive = false;
   this.awaitingReconnect = false;
   this.clearReconnectTimer();
   this.detachReconnectListeners();
   this.loading.set(false);
   this.error.set(null);
   this.closed = false;
  }
}