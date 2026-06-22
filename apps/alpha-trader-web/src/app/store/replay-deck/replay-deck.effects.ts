import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, map, of, switchMap, withLatestFrom } from 'rxjs';
import { DeckApiService } from '../../core/services/deck-api.service';
import { DeckUiActions } from '../deck/deck.actions';
import { selectStyle, selectSymbol } from '../deck/deck.selectors';
import { ReplayDeckActions } from './replay-deck.actions';
import { selectReplaySessionDate } from './replay-deck.selectors';

@Injectable()
export class ReplayDeckEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly deckApi = inject(DeckApiService);

  readonly loadReplay$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayDeckActions.loadRequested, ReplayDeckActions.entered),
      withLatestFrom(
        this.store.select(selectSymbol),
        this.store.select(selectStyle),
        this.store.select(selectReplaySessionDate),
      ),
      switchMap(([action, symbol, style, sessionDate]) => {
        const date =
          'sessionDate' in action && action.sessionDate ? action.sessionDate : sessionDate;
        return this.deckApi.getReplay(symbol, style, date).pipe(
          map((payload) => ReplayDeckActions.loadSuccess({ payload })),
          catchError((err) =>
            of(
              ReplayDeckActions.loadFailed({
                error: err?.error?.error || err.message || 'Replay failed',
              }),
            ),
          ),
        );
      }),
    ),
  );

  readonly updateTrackerOnReplay$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayDeckActions.loadSuccess),
      map(({ payload }) => {
        const points = payload.replayPoints ?? [];
        const last = points.at(-1);
        const first = points[0];
        const lastSpot = last?.spot ?? null;
        const dayChange =
          first?.spot != null && lastSpot != null ? lastSpot - first.spot : null;
        const dayChangePct =
          first?.spot != null && lastSpot != null && first.spot > 0
            ? ((lastSpot - first.spot) / first.spot) * 100
            : null;
        return DeckUiActions.trackerUpdated({
          symbol: payload.symbol,
          symbolLabel: payload.symbolLabel,
          price: lastSpot,
          dayChange,
          dayChangePct,
          style: payload.tradingStyle,
          connected: true,
          live: false,
          asOf: new Date().toISOString(),
        });
      }),
    ),
  );
}