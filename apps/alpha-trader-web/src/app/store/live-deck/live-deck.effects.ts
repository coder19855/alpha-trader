import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  catchError,
  EMPTY,
  filter,
  map,
  merge,
  mergeMap,
  of,
  switchMap,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs';
import { deckKey } from '../../core/routing/deck-routes';
import { DeckLiveTick, TradingStyle } from '../../core/models/deck.models';
import { DeckAlertService } from '../../core/services/deck-alert.service';
import { DeckApiService } from '../../core/services/deck-api.service';
import { DeckStreamService } from '../../core/services/deck-stream.service';
import { selectStyle, selectSymbol } from '../deck/deck.selectors';
import { DeckUiActions } from '../deck/deck.actions';
import { LiveDeckActions } from './live-deck.actions';

@Injectable()
export class LiveDeckEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly deckApi = inject(DeckApiService);
  private readonly stream = inject(DeckStreamService);
  private readonly deckAlerts = inject(DeckAlertService);

  readonly loadSettingsOnEnter$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LiveDeckActions.entered),
      switchMap(() =>
        this.deckApi.getSettings().pipe(
          map((settings) => LiveDeckActions.settingsLoaded({ settings })),
          catchError(() => EMPTY),
        ),
      ),
    ),
  );

  readonly reloadDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        LiveDeckActions.entered,
        LiveDeckActions.retry,
        DeckUiActions.symbolChanged,
        DeckUiActions.styleChanged,
      ),
      withLatestFrom(
        this.store.select(selectSymbol),
        this.store.select(selectStyle),
      ),
      switchMap(([action, symbol, style]) => {
        const sym = 'symbol' in action && action.symbol ? action.symbol : symbol;
        const sty = ('style' in action && action.style ? action.style : style) as TradingStyle;
        const key = deckKey(sym, sty);
        this.deckAlerts.reset();

        const fast$ = this.deckApi.getLive(sym, sty, 'fast').pipe(
          map((tick) => LiveDeckActions.fastTickReceived({ deckKey: key, tick })),
          catchError((err) =>
            of(
              LiveDeckActions.loadFailed({
                deckKey: key,
                error: err?.error?.error || err.message || 'Live deck failed',
              }),
            ),
          ),
        );

        const enrichment$ = this.deckApi.getLive(sym, sty, 'enrichment').pipe(
          map((patch) => LiveDeckActions.chartPatchReceived({ deckKey: key, patch })),
          catchError(() => EMPTY),
        );

        const stream$ = this.stream.connect(sym, sty).pipe(
          map((event) => {
            if ('type' in event && event.type === 'status') {
              return DeckUiActions.trackerUpdated({
                connected: event.phase === 'connecting',
                live: event.phase !== 'closed',
              });
            }
            if (
              'type' in event &&
              (event.type === 'enrichment' || event.type === 'positions' || event.type === 'ltp')
            ) {
              const patch = event as Partial<DeckLiveTick> & { type: string };
              const { type: _type, ...rest } = patch;
              return LiveDeckActions.chartPatchReceived({ deckKey: key, patch: rest });
            }
            if ('action' in event) {
              return LiveDeckActions.tickMerged({ deckKey: key, tick: event as DeckLiveTick });
            }
            return null;
          }),
          filter((action): action is NonNullable<typeof action> => action != null),
          catchError(() => of(DeckUiActions.trackerUpdated({ connected: false, live: false }))),
          takeUntil(this.actions$.pipe(ofType(LiveDeckActions.left, LiveDeckActions.loadStarted))),
        );

        return merge(
          of(LiveDeckActions.loadStarted({ symbol: sym, style: sty })),
          fast$,
          enrichment$,
          stream$,
        );
      }),
      mergeMap((action) => of(action)),
    ),
  );

  readonly updateTrackerOnTick$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LiveDeckActions.fastTickReceived, LiveDeckActions.tickMerged),
      map(({ tick }) =>
        DeckUiActions.trackerUpdated({
          symbol: tick.symbol,
          symbolLabel: tick.symbolLabel,
          price: tick.lastPrice,
          dayChange: tick.dayChange ?? null,
          dayChangePct: tick.dayChangePct ?? null,
          style: tick.tradingStyle,
          connected: true,
          live: true,
          asOf: tick.asOf,
        }),
      ),
    ),
  );

  readonly alertBaseline$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(LiveDeckActions.fastTickReceived),
        tap(({ tick }) => this.deckAlerts.setBaseline(tick)),
      ),
    { dispatch: false },
  );
}