import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DeckLiveTick } from '../models/deck.models';

export type DeckStreamPhase =
  | 'connecting'
  | 'live'
  | 'stale'
  | 'disconnected'
  | 'closed';

export type DeckStreamEvent =
  | DeckLiveTick
  | {
      type: 'status';
      message: string;
      phase: DeckStreamPhase;
    }
  | { type: 'heartbeat'; asOf: string }
  | { type: 'enrichment'; asOf: string }
  | { type: 'ltp' | 'positions' | 'error'; message?: string; asOf?: string };

const STREAM_STALE_MS = 35_000;
const STREAM_WATCHDOG_MS = 5_000;
const STREAM_CONNECT_TIMEOUT_MS = 45_000;

function isLivenessPayload(event: DeckStreamEvent): boolean {
  if (!event || typeof event !== 'object') return false;
  if ('type' in event) {
    const type = event.type;
    return (
      type === 'heartbeat' ||
      type === 'enrichment' ||
      type === 'ltp' ||
      type === 'positions'
    );
  }
  return 'action' in event;
}

@Injectable({ providedIn: 'root' })
export class DeckStreamService {
  private readonly zone = inject(NgZone);

  connect(symbol: string, style: string): Observable<DeckStreamEvent> {
    return new Observable((subscriber) => {
      const params = new URLSearchParams({ symbol, style });
      let closed = false;
      let source: EventSource | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let watchdogTimer: ReturnType<typeof setInterval> | null = null;
      let reconnectListenersAttached = false;
      let awaitingReconnect = false;
      let transportOpen = false;
      let transportOpenedAt = 0;
      let lastLiveAt = 0;
      let streamLive = false;

      const clearReconnectTimer = (): void => {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      };

      const clearWatchdog = (): void => {
        if (watchdogTimer) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
        }
      };

      const detachReconnectListeners = (): void => {
        if (!reconnectListenersAttached) return;
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        reconnectListenersAttached = false;
      };

      const emitStatus = (phase: DeckStreamPhase, message: string): void => {
        subscriber.next({ type: 'status', message, phase });
      };

      const markLive = (): void => {
        lastLiveAt = Date.now();
        if (!streamLive) {
          streamLive = true;
          emitStatus('live', 'Connected');
        }
      };

      const forceReconnect = (message: string, phase: DeckStreamPhase): void => {
        if (closed) return;
        streamLive = false;
        transportOpen = false;
        lastLiveAt = 0;
        emitStatus(phase, message);
        if (source) {
          source.close();
          source = null;
        }
        scheduleReconnect();
      };

      const tryReconnect = (): void => {
        if (closed || source) return;
        awaitingReconnect = false;
        clearReconnectTimer();
        connectSource();
      };

      const scheduleReconnect = (): void => {
        if (closed || source || awaitingReconnect) return;
        awaitingReconnect = true;
        if (!reconnectListenersAttached) {
          window.addEventListener('focus', handleFocus);
          document.addEventListener('visibilitychange', handleVisibilityChange);
          reconnectListenersAttached = true;
        }
        if (document.visibilityState === 'visible' && document.hasFocus()) {
          reconnectTimer = setTimeout(tryReconnect, 1500);
        }
      };

      const handleFocus = (): void => {
        if (closed || source || !awaitingReconnect) return;
        if (document.visibilityState === 'visible' && document.hasFocus()) {
          clearReconnectTimer();
          tryReconnect();
        }
      };

      const handleVisibilityChange = (): void => {
        if (closed || source || !awaitingReconnect) return;
        if (document.visibilityState === 'visible' && document.hasFocus()) {
          clearReconnectTimer();
          tryReconnect();
        }
      };

      const startWatchdog = (): void => {
        if (watchdogTimer) return;
        watchdogTimer = setInterval(() => {
          if (closed || !transportOpen) return;
          const now = Date.now();
          if (!streamLive && now - transportOpenedAt > STREAM_CONNECT_TIMEOUT_MS) {
            forceReconnect(
              'No live data — reconnecting…',
              'stale',
            );
            return;
          }
          if (streamLive && lastLiveAt > 0 && now - lastLiveAt > STREAM_STALE_MS) {
            forceReconnect(
              'Stream stale — reconnecting…',
              'stale',
            );
          }
        }, STREAM_WATCHDOG_MS);
      };

      const connectSource = (): void => {
        if (closed || source) return;
        streamLive = false;
        transportOpen = false;
        lastLiveAt = 0;
        emitStatus('connecting', 'Connecting…');
        source = new EventSource(`/api/deck/stream?${params}`);

        source.onopen = () => {
          if (closed) return;
          transportOpen = true;
          transportOpenedAt = Date.now();
          awaitingReconnect = false;
          clearReconnectTimer();
          detachReconnectListeners();
          emitStatus('connecting', 'Awaiting live data…');
          startWatchdog();
        };

        source.onmessage = (event: MessageEvent<string>) => {
          if (closed) return;
          this.zone.run(() => {
            try {
              const payload = JSON.parse(event.data) as DeckStreamEvent;
              if (
                payload &&
                typeof payload === 'object' &&
                'type' in payload &&
                payload.type === 'heartbeat'
              ) {
                markLive();
                return;
              }
              if (isLivenessPayload(payload)) {
                markLive();
              } else if ('action' in payload) {
                markLive();
              }
              subscriber.next(payload);
            } catch {
              subscriber.error(new Error('Invalid SSE payload'));
            }
          });
        };

        source.onerror = () => {
          if (closed || !source) return;
          source.close();
          source = null;
          transportOpen = false;
          streamLive = false;
          lastLiveAt = 0;
          emitStatus(
            'disconnected',
            'Disconnected — reconnecting when you return',
          );
          scheduleReconnect();
        };
      };

      connectSource();

      return () => {
        closed = true;
        awaitingReconnect = false;
        clearReconnectTimer();
        clearWatchdog();
        detachReconnectListeners();
        source?.close();
        source = null;
      };
    });
  }
}