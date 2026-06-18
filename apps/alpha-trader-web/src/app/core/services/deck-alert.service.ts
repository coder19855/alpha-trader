import { Injectable, inject, signal } from '@angular/core';
import { DeckLiveTick } from '../models/deck.models';
import { AlertSoundKind, AlertSoundService } from './alert-sound.service';

export type DeckToastKind = 'signal' | 'conviction' | 'position' | 'info';

export interface DeckToast {
  id: string;
  kind: DeckToastKind;
  title: string;
  message: string;
  createdAt: number;
}

const MAX_TOASTS = 6;
const TOAST_TTL_MS = 12_000;
const CONVICTION_DELTA_MIN = 10;

@Injectable({ providedIn: 'root' })
export class DeckAlertService {
  private readonly sounds = inject(AlertSoundService);

  readonly toasts = signal<DeckToast[]>([]);

  private seeded = false;
  private lastConviction = -1;
  private lastAdviceOverall = '';
  private lastAdviceHeadline = '';
  private lastAutoExitStatus = '';

  reset(): void {
    this.seeded = false;
    this.lastConviction = -1;
    this.lastAdviceOverall = '';
    this.lastAdviceHeadline = '';
    this.lastAutoExitStatus = '';
    this.toasts.set([]);
  }

  setBaseline(tick: DeckLiveTick): void {
    this.seeded = true;
    this.lastConviction = tick.conviction;
    const ctx = tick.managementContext;
    this.lastAdviceOverall = ctx?.advice?.overall ?? '';
    this.lastAdviceHeadline = ctx?.advice?.headline ?? '';
    this.lastAutoExitStatus = ctx?.autoExit?.status ?? '';
  }

  evaluate(prev: DeckLiveTick, next: DeckLiveTick): void {
    if (!this.seeded) {
      this.setBaseline(next);
      return;
    }

    const symbol = next.symbolLabel || next.symbol || 'Index';

    this.checkTradeSignal(symbol, prev, next);
    this.checkConviction(symbol, prev, next);
    this.checkPosition(symbol, prev, next);
  }

  dismiss(id: string): void {
    this.toasts.update((rows) => rows.filter((row) => row.id !== id));
  }

  private checkTradeSignal(symbol: string, prev: DeckLiveTick, next: DeckLiveTick): void {
    const prevAction = prev.action;
    const nextAction = next.action;
    if (nextAction === prevAction) return;

    const directional = nextAction === 'CE-BUY' || nextAction === 'PE-BUY';
    if (!directional) return;

    const atThreshold = next.conviction >= next.entryThreshold;
    const wasFlat =
      prevAction === 'NO-TRADE' || prevAction === 'NEUTRAL' || !prevAction;
    const flipped =
      (prevAction === 'CE-BUY' && nextAction === 'PE-BUY') ||
      (prevAction === 'PE-BUY' && nextAction === 'CE-BUY');

    if (!wasFlat && !flipped && !atThreshold) return;

    const vetoNote = next.chartVetoed
      ? ` Chart veto: ${next.vetoReason || 'active'}.`
      : '';
    const thresholdNote = atThreshold
      ? ` At/above ${next.entryThreshold}% entry threshold.`
      : ` Below ${next.entryThreshold}% entry threshold.`;

    this.pushToast({
      kind: 'signal',
      title: wasFlat ? 'Trade signal' : flipped ? 'Signal flip' : 'Signal update',
      message: `${symbol} → ${nextAction} at ${next.conviction}%.${thresholdNote}${vetoNote}`,
      sound: 'signal',
    });
  }

  private checkConviction(symbol: string, prev: DeckLiveTick, next: DeckLiveTick): void {
    if (prev.action !== next.action) {
      this.lastConviction = next.conviction;
      return;
    }

    const delta = next.conviction - prev.conviction;
    const absDelta = Math.abs(delta);
    const crossedUp =
      prev.conviction < next.entryThreshold && next.conviction >= next.entryThreshold;
    const crossedDown =
      prev.conviction >= next.entryThreshold && next.conviction < next.entryThreshold;

    if (absDelta < CONVICTION_DELTA_MIN && !crossedUp && !crossedDown) return;
    if (next.conviction === this.lastConviction && !crossedUp && !crossedDown) return;

    let title = 'Conviction shift';
    if (crossedUp) title = 'Conviction crossed entry';
    else if (crossedDown) title = 'Conviction fell below entry';

    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    this.pushToast({
      kind: 'conviction',
      title,
      message: `${symbol} ${prev.conviction}% → ${next.conviction}% (${direction}) · threshold ${next.entryThreshold}%`,
      sound: 'conviction',
    });
    this.lastConviction = next.conviction;
  }

  private checkPosition(symbol: string, prev: DeckLiveTick, next: DeckLiveTick): void {
    const nextCtx = next.managementContext;
    if (!nextCtx?.hasOpenPosition) {
      this.lastAdviceOverall = '';
      this.lastAdviceHeadline = '';
      this.lastAutoExitStatus = '';
      return;
    }

    const overall = nextCtx.advice?.overall ?? '';
    const headline = nextCtx.advice?.headline ?? nextCtx.note ?? '';
    const autoStatus = nextCtx.autoExit?.status ?? '';

    if (
      autoStatus &&
      autoStatus !== this.lastAutoExitStatus &&
      (autoStatus === 'pending' || autoStatus === 'executed')
    ) {
      this.pushToast({
        kind: 'position',
        title: autoStatus === 'executed' ? 'Auto-exit executed' : 'Auto-exit pending',
        message: nextCtx.autoExit?.message || headline || 'Review open legs on Positions tab.',
        sound: 'position',
      });
      this.lastAutoExitStatus = autoStatus;
    }

    const overallChanged =
      overall && overall !== this.lastAdviceOverall && overall !== 'HOLD';
    const headlineChanged =
      headline &&
      headline !== this.lastAdviceHeadline &&
      !overallChanged &&
      autoStatus === this.lastAutoExitStatus;

    if (overallChanged) {
      this.pushToast({
        kind: 'position',
        title: this.positionTitle(overall),
        message: headline || `${symbol} position needs attention.`,
        sound: 'position',
      });
      this.lastAdviceOverall = overall;
      this.lastAdviceHeadline = headline;
      return;
    }

    if (headlineChanged && this.isActionableAdvice(overall)) {
      this.pushToast({
        kind: 'position',
        title: 'Position note',
        message: headline,
        sound: 'position',
      });
      this.lastAdviceHeadline = headline;
    }
  }

  private positionTitle(overall: string): string {
    if (overall === 'HARD_EXIT' || overall === 'EXIT_SOON') return 'Exit suggested';
    if (overall === 'PARTIAL_BOOK') return 'Book partials';
    if (overall === 'TRAIL') return 'Trail stop';
    if (overall === 'STRONG_HOLD') return 'Strong hold';
    if (overall === 'CONFLICT') return 'Position conflict';
    return 'Position update';
  }

  private isActionableAdvice(overall: string): boolean {
    return ['EXIT_SOON', 'HARD_EXIT', 'PARTIAL_BOOK', 'TRAIL', 'CONFLICT'].includes(
      overall,
    );
  }

  private pushToast(params: {
    kind: DeckToastKind;
    title: string;
    message: string;
    sound?: AlertSoundKind;
  }): void {
    const toast: DeckToast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: params.kind,
      title: params.title,
      message: params.message,
      createdAt: Date.now(),
    };

    this.toasts.update((rows) => [toast, ...rows].slice(0, MAX_TOASTS));
    if (params.sound) {
      this.sounds.play(params.sound);
    }

    window.setTimeout(() => this.dismiss(toast.id), TOAST_TTL_MS);
  }
}