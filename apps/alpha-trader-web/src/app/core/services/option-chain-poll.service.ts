import { Injectable, inject, signal } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { OptionChainSignalPayload } from '../models/option-chain.models';
import { TradingStyle } from '../models/deck.models';
import { OptionChainApiService } from './option-chain-api.service';

function readOptionChainError(err: unknown): string {
  const body = (err as { error?: unknown })?.error;
  if (typeof body === 'string' && body.trim()) return body.trim();
  if (body && typeof body === 'object') {
    const msg = (body as { error?: string }).error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  const message = (err as { message?: string })?.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return 'Option chain fetch failed';
}

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
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private sub: Subscription | null = null;
  private ctx: OptionPollContext | null = null;

  configure(ctx: OptionPollContext): void {
    this.ctx = ctx;
    this.sub?.unsubscribe();
    this.sub = null;

    if (!ctx.enabled) return;

    const pollOnce = () => {
      this.loading.set(true);
      this.error.set(null);
      this.api
        .fetch({
          symbol: ctx.symbol,
          style: ctx.style,
          paAction: ctx.paAction,
          moneyness: ctx.moneyness || undefined,
        })
        .subscribe({
          next: (payload) => {
            this.data.set(payload);
            this.loading.set(false);
          },
          error: (err) => {
            this.loading.set(false);
            this.error.set(readOptionChainError(err));
          },
        });
    };

    pollOnce();
    if (ctx.pollMs > 0) {
      this.sub = timer(ctx.pollMs, ctx.pollMs)
        .pipe(switchMap(() => this.api.fetch({
          symbol: ctx.symbol,
          style: ctx.style,
          paAction: ctx.paAction,
          moneyness: ctx.moneyness || undefined,
        })))
        .subscribe({
          next: (payload) => this.data.set(payload),
          error: () => {
            /* keep last good payload on poll errors */
          },
        });
    }
  }

  /** Fetch option chain even when polling is stopped (e.g. shell reconnect). */
  prefetch(
    params: Pick<OptionPollContext, 'symbol' | 'style' | 'paAction' | 'moneyness'>,
    force = true,
  ): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .fetch({
        symbol: params.symbol,
        style: params.style,
        refresh: force,
        paAction: params.paAction,
        moneyness: params.moneyness || undefined,
      })
      .subscribe({
        next: (payload) => {
          this.data.set(payload);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(readOptionChainError(err));
        },
      });
  }

  refresh(force = true): void {
    if (!this.ctx) return;
    this.loading.set(true);
    this.error.set(null);
    this.api
      .fetch({
        symbol: this.ctx.symbol,
        style: this.ctx.style,
        refresh: force,
        paAction: this.ctx.paAction,
        moneyness: this.ctx.moneyness || undefined,
      })
      .subscribe({
        next: (payload) => {
          this.data.set(payload);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(readOptionChainError(err));
        },
      });
  }

  stop(): void {
    this.sub?.unsubscribe();
    this.sub = null;
    this.ctx = null;
  }
}