import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { routerNavigatedAction } from '@ngrx/router-store';
import { filter, map, tap } from 'rxjs';
import { deckRouteSegments, parseDeckRoute } from '../../core/routing/deck-routes';
import { AppView } from '../../core/services/deck-context.service';
import { DeckUiActions } from './deck.actions';

@Injectable()
export class DeckRouterEffects {
  private readonly actions$ = inject(Actions);
  private readonly router = inject(Router);

  readonly syncRouteToStore$ = createEffect(() =>
    this.actions$.pipe(
      ofType(routerNavigatedAction),
      map(({ payload }) => parseDeckRoute(payload.routerState.url)),
      filter(({ view }) => view !== 'other' && view !== 'login'),
      map(({ view, tab }) =>
        DeckUiActions.routeSynced({
          view: view as AppView,
          tab,
        }),
      ),
    ),
  );

  readonly navigateOnTabSelected$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DeckUiActions.tabSelected),
        tap(({ tab }) => {
          const parsed = parseDeckRoute(this.router.url);
          if (parsed.view === 'benchmark' || parsed.view === 'login') return;
          const view = parsed.view === 'replay' ? 'replay' : 'live';
          const currentTab = parsed.tab;
          if (currentTab === tab) return;
          void this.router.navigate(deckRouteSegments(view, tab));
        }),
      ),
    { dispatch: false },
  );
}