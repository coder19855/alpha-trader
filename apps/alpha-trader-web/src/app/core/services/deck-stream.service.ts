import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DeckLiveTick } from '../models/deck.models';

export type DeckStreamEvent =
  | DeckLiveTick
  | { type: 'status'; message: string; phase: string }
  | { type: 'enrichment'; asOf: string }
  | { type: 'ltp' | 'positions' | 'error'; message?: string; asOf?: string };

@Injectable({ providedIn: 'root' })
export class DeckStreamService {
  private readonly zone = inject(NgZone);

  connect(symbol: string, style: string): Observable<DeckStreamEvent> {
    return new Observable((subscriber) => {
      const params = new URLSearchParams({ symbol, style });
      const source = new EventSource(`/api/deck/stream?${params}`);
      let closed = false;

      source.onmessage = (event: MessageEvent<string>) => {
        this.zone.run(() => {
          try {
            subscriber.next(JSON.parse(event.data) as DeckStreamEvent);
          } catch {
            subscriber.error(new Error('Invalid SSE payload'));
          }
        });
      };

      source.onerror = () => {
        if (!closed) subscriber.error(new Error('Deck stream disconnected'));
      };

      return () => {
        closed = true;
        source.close();
      };
    });
  }
}