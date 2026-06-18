import { Injectable } from '@angular/core';

export type AlertSoundKind = 'signal' | 'conviction' | 'position';

@Injectable({ providedIn: 'root' })
export class AlertSoundService {
  private audioCtx: AudioContext | null = null;
  private unlocked = false;

  /** Call once after a user gesture so browsers allow playback. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    void this.audioCtx.resume();
  }

  play(kind: AlertSoundKind): void {
    if (!this.unlocked) return;
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    const ctx = this.audioCtx;
    void ctx.resume().then(() => {
      if (kind === 'signal') {
        this.playTone(ctx, 880, 0.09, 0, 0.14);
        this.playTone(ctx, 1175, 0.09, 0.16, 0.18);
      } else if (kind === 'conviction') {
        this.playTone(ctx, 660, 0.07, 0, 0.12);
        this.playTone(ctx, 784, 0.06, 0.14, 0.1);
      } else {
        this.playTone(ctx, 420, 0.1, 0, 0.16);
        this.playTone(ctx, 320, 0.12, 0.2, 0.2);
      }
    });
  }

  private playTone(
    ctx: AudioContext,
    frequency: number,
    volume: number,
    delaySec: number,
    durationSec: number,
  ): void {
    const start = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }
}