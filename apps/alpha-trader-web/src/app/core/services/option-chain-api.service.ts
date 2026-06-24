import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  OptionChainSignalPayload,
  OptionMoneyness,
  OptionSide,
} from '../models/option-chain.models';
import { TradingStyle } from '../models/deck.models';

export interface OptionChainQuery {
  symbol: string;
  style: TradingStyle;
  refresh?: boolean;
  moneyness?: OptionMoneyness;
  side?: OptionSide;
  paAction?: string;
}

@Injectable({ providedIn: 'root' })
export class OptionChainApiService {
  private readonly http = inject(HttpClient);

  fetch(query: OptionChainQuery): Observable<OptionChainSignalPayload> {
    let params = new HttpParams()
      .set('symbol', query.symbol)
      .set('style', query.style);
    if (query.refresh) params = params.set('refresh', 'true');
    if (query.moneyness) params = params.set('moneyness', query.moneyness);
    if (query.side) params = params.set('side', query.side);
    if (query.paAction) params = params.set('paAction', query.paAction);
    return this.http.get<OptionChainSignalPayload>('/api/option-chain', {
      params,
    });
  }

  stream(
    query: Pick<OptionChainQuery, 'symbol' | 'style' | 'paAction'>,
  ): Observable<OptionChainSignalPayload> {
    return new Observable((subscriber) => {
      const params = new URLSearchParams({
        symbol: query.symbol,
        style: query.style,
      });
      if (query.paAction) {
        params.set('paAction', query.paAction);
      }
      const source = new EventSource(`/api/option-chain/stream?${params}`);

      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as OptionChainSignalPayload & {
            type?: string;
            message?: string;
            error?: string;
          };
          if (payload.type === 'error') {
            subscriber.error(
              new Error(payload.message || payload.error || 'Option chain stream error'),
            );
            return;
          }
          if (payload.error) {
            subscriber.error(new Error(payload.error));
            return;
          }
          subscriber.next(payload);
        } catch {
          subscriber.error(new Error('Invalid option chain stream payload'));
        }
      };

      source.onerror = () => {
        source.close();
        subscriber.error(new Error('Option chain stream disconnected'));
      };

      return () => {
        source.close();
      };
    });
  }
}