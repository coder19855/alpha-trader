import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DeckLiveTick } from '../models/deck.models';
import { OptionChainSignalPayload } from '../models/option-chain.models';

export type DeckStreamEvent =
  | DeckLiveTick
  | {
      type: 'status';
      message: string;
      phase: 'connecting' | 'connected' | 'disconnected' | 'closed';
    }
  | { type: 'enrichment'; asOf: string }
  | ({ type: 'option-chain' } & OptionChainSignalPayload)
  | { type: 'ltp' | 'positions' | 'error'; message?: string; asOf?: string };

@Injectable({ providedIn: 'root' })
export class DeckStreamService {
  private readonly zone = inject(NgZone);

  connect(symbol: string, style: string): Observable<DeckStreamEvent> {
    return new Observable((subscriber) => {
      const params = new URLSearchParams({ symbol, style });
      let closed = false;
      let source: EventSource | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let reconnectListenersAttached = false;
      let awaitingReconnect = false;

      const clearReconnectTimer = (): void => {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      };

      const detachReconnectListeners = (): void => {
        if (!reconnectListenersAttached) return;
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        reconnectListenersAttached = false;
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

      const connectSource = (): void => {
        if (closed || source) return;
        subscriber.next({
          type: 'status',
          message: 'Connecting…',
          phase: 'connecting',
        });
        source = new EventSource(`/api/deck/stream?${params}`);

        source.onopen = () => {
          if (closed) return;
          subscriber.next({
            type: 'status',
            message: 'Connected',
            phase: 'connected',
          });
          awaitingReconnect = false;
          clearReconnectTimer();
          detachReconnectListeners();
        };

        source.onmessage = (event: MessageEvent<string>) => {
          if (closed) return;
          this.zone.run(() => {
            try {
              subscriber.next(JSON.parse(event.data) as DeckStreamEvent);
            } catch {
              subscriber.error(new Error('Invalid SSE payload'));
            }
          });
        };

        source.onerror = () => {
          if (closed || !source) return;
          source.close();
          source = null;
          subscriber.next({
            type: 'status',
            message: 'Disconnected — reconnecting when you return',
            phase: 'disconnected',
          });
          scheduleReconnect();
        };
      };

      connectSource();

      return () => {
        closed = true;
        awaitingReconnect = false;
        clearReconnectTimer();
        detachReconnectListeners();
        source?.close();
        source = null;
      };
    });
  }
}