import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { OptionChainSignalPayload } from '../models/option-chain.models';
import { TradingStyle } from '../models/deck.models';
import { OptionChainApiService } from './option-chain-api.service';

export interface OptionPollContext {
  symbol: string;
  style: TradingStyle;
  pollMs: number;
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
  private fetchSub: Subscription | null = null;
  private ctx: OptionPollContext | null = null;

  private scheduleKey(ctx: OptionPollContext): string {
   return `${ctx.symbol}|${ctx.style}|${ctx.pollMs}|${ctx.moneyness ?? ''}`;
  }

  private fetchParams(
   ctx: OptionPollContext,
   refresh = false,
  ): Parameters<OptionChainApiService['fetch']>[0] {
   return {
     symbol: ctx.symbol,
     style: ctx.style,
     refresh,
     paAction: ctx.paAction,
     moneyness: ctx.moneyness || undefined,
   };
  }

  private runFetch(showLoading: boolean, refresh = false): void {
   if (!this.ctx) return;
   this.fetchSub?.unsubscribe();
   if (showLoading) this.loading.set(true);
   this.error.set(null);
   this.fetchSub = this.api.fetch(this.fetchParams(this.ctx, refresh)).subscribe({
     next: (payload) => {
       this.data.set(payload);
       if (showLoading) this.loading.set(false);
     },
     error: (err) => {
       if (showLoading) this.loading.set(false);
       const body = (err as { error?: unknown })?.error;
       if (typeof body === 'string' && body.trim()) {
         this.error.set(body.trim());
         return;
       }
       if (body && typeof body === 'object') {
         const msg = (body as { error?: string }).error;
         if (typeof msg === 'string' && msg.trim()) {
           this.error.set(msg.trim());
           return;
         }
       }
       const message = (err as { message?: string })?.message;
       this.error.set(
         typeof message === 'string' && message.trim()
           ? message.trim()
           : 'Option chain fetch failed',
       );
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
     prev != null &&
     this.scheduleKey(prev) === this.scheduleKey(ctx) &&
     this.sub != null;

   this.ctx = ctx;

   // Deck ticks only change paAction — keep polling schedule, skip refetch + loading flash.
   if (sameSchedule) {
     return;
   }

   this.sub?.unsubscribe();
   this.sub = null;

   this.runFetch(!this.data());

   if (ctx.pollMs > 0) {
     this.sub = timer(ctx.pollMs, ctx.pollMs)
       .pipe(
         switchMap(() => {
           if (!this.ctx) return EMPTY;
           return this.api.fetch(this.fetchParams(this.ctx));
         }),
       )
       .subscribe({
         next: (payload) => this.data.set(payload),
         error: () => {
           /* keep last good payload on poll errors */
         },
       });
   }
  }

  refresh(force = true): void {
   if (!this.ctx) return;
   this.runFetch(true, force);
  }

  stop(): void {
   this.ctx = null;
   this.sub?.unsubscribe();
   this.sub = null;
   this.fetchSub?.unsubscribe();
   this.fetchSub = null;
   this.loading.set(false);
  }
}