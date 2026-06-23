import { Injectable, inject, signal } from '@angular/core';
import { OptionChainSignalPayload } from '../models/option-chain.models';
import { TradingStyle } from '../models/deck.models';
import { DeckReloadService } from './deck-reload.service';

export interface OptionPollContext {
  symbol: string;
  style: TradingStyle;
  paAction?: string;
  moneyness?: '' | 'ATM' | 'OTM' | 'ITM';
}

@Injectable({ providedIn: 'root' })
export class OptionChainPollService {
  private readonly deckReload = inject(DeckReloadService);

  readonly data = signal<OptionChainSignalPayload | null>(null);
  readonly loading = signal(false);

  readonly error = signal<string | null>(null);

  private ctx: OptionPollContext | null = null;

  private scheduleKey(ctx: OptionPollContext): string {
   return `${ctx.symbol}|${ctx.style}|${ctx.moneyness ?? ''}`;
  }

  configure(ctx: OptionPollContext): void {
   const prev = this.ctx;
   const sameSchedule =
     prev != null &&
     this.scheduleKey(prev) === this.scheduleKey(ctx) &&
     this.data() != null;

   this.ctx = ctx;

   if (sameSchedule) {
     this.error.set(null);
     return;
   }

   this.data.set(null);
   this.loading.set(true);
   this.error.set(null);
  }

  receive(payload: OptionChainSignalPayload): void {
   if (!this.ctx) return;
   if (
     payload.symbol !== this.ctx.symbol ||
     payload.tradingStyle !== this.ctx.style
   ) {
     return;
   }
   this.data.set(payload);
   this.loading.set(false);
   this.error.set(null);
  }

  markError(message: string): void {
   this.loading.set(false);
   this.error.set(message);
  }

  refresh(force = true): void {
   if (!this.ctx) return;
   this.loading.set(true);
   this.error.set(null);
   if (force) {
     this.deckReload.request();
   }
  }

  stop(): void {
   this.ctx = null;
   this.loading.set(false);
  }
}