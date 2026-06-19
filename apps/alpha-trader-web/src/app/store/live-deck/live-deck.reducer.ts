import { EntityAdapter, EntityState, createEntityAdapter } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { DeckLiveTick, SettingsSnapshot } from '../../core/models/deck.models';
import { patchMultiTfSpotCandles } from '../../core/utils/live-candle-patch';
import { LiveDeckActions } from './live-deck.actions';

export interface LiveTickRecord extends DeckLiveTick {
  id: string;
  deckKey: string;
}

export interface LiveDeckState extends EntityState<LiveTickRecord> {
  activeDeckKey: string | null;
  loadingKeys: string[];
  errorByKey: Record<string, string | null>;
  pendingChartPatchByKey: Record<string, Partial<DeckLiveTick>>;
  settings: SettingsSnapshot | null;
}

export const liveTickAdapter: EntityAdapter<LiveTickRecord> = createEntityAdapter<LiveTickRecord>();

export const initialLiveDeckState: LiveDeckState = liveTickAdapter.getInitialState({
  activeDeckKey: null,
  loadingKeys: [],
  errorByKey: {},
  pendingChartPatchByKey: {},
  settings: null,
});

function setLoading(state: LiveDeckState, deckKey: string, loading: boolean): LiveDeckState {
  const loadingKeys = loading
    ? [...new Set([...state.loadingKeys, deckKey])]
    : state.loadingKeys.filter((k) => k !== deckKey);
  return { ...state, loadingKeys, activeDeckKey: deckKey };
}

function withLiveChartCandles<T extends DeckLiveTick>(tick: T): T {
  if (!Number.isFinite(tick.lastPrice) || tick.lastPrice <= 0) return tick;
  const candlePatch = patchMultiTfSpotCandles(tick, tick.lastPrice);
  if (!Object.keys(candlePatch).length) return tick;
  return { ...tick, ...candlePatch };
}

function upsertTick(state: LiveDeckState, deckKey: string, tick: DeckLiveTick): LiveDeckState {
  const pending = state.pendingChartPatchByKey[deckKey];
  const merged = withLiveChartCandles({
    ...(state.entities[deckKey] ?? {}),
    ...(pending ?? {}),
    ...tick,
    id: deckKey,
    deckKey,
  } as LiveTickRecord);
  return liveTickAdapter.upsertOne(merged, {
    ...state,
    activeDeckKey: deckKey,
    loadingKeys: state.loadingKeys.filter((k) => k !== deckKey),
    errorByKey: { ...state.errorByKey, [deckKey]: null },
  });
}

export const liveDeckReducer = createReducer(
  initialLiveDeckState,
  on(LiveDeckActions.loadStarted, (state, { symbol, style }) => {
    const deckKey = `${symbol}|${style}`;
    const { [deckKey]: _removed, ...pendingChartPatchByKey } = state.pendingChartPatchByKey;
    return setLoading(
      liveTickAdapter.removeOne(deckKey, {
        ...state,
        pendingChartPatchByKey,
        errorByKey: { ...state.errorByKey, [deckKey]: null },
      }),
      deckKey,
      true,
    );
  }),
  on(LiveDeckActions.fastTickReceived, (state, { deckKey, tick }) => upsertTick(state, deckKey, tick)),
  on(LiveDeckActions.tickMerged, (state, { deckKey, tick }) => upsertTick(state, deckKey, tick)),
  on(LiveDeckActions.chartPatchReceived, (state, { deckKey, patch }) => {
    const pending = { ...(state.pendingChartPatchByKey[deckKey] ?? {}), ...patch };
    const pendingChartPatchByKey = { ...state.pendingChartPatchByKey, [deckKey]: pending };
    const existing = state.entities[deckKey];
    if (!existing) {
      return { ...state, pendingChartPatchByKey };
    }
    const merged = withLiveChartCandles({
      ...existing,
      ...patch,
      id: deckKey,
      deckKey,
    } as LiveTickRecord);
    return liveTickAdapter.upsertOne(merged, { ...state, pendingChartPatchByKey });
  }),
  on(LiveDeckActions.loadFailed, (state, { deckKey, error }) => ({
    ...state,
    activeDeckKey: deckKey,
    loadingKeys: state.loadingKeys.filter((k) => k !== deckKey),
    errorByKey: { ...state.errorByKey, [deckKey]: error },
  })),
  on(LiveDeckActions.settingsLoaded, LiveDeckActions.settingsUpdated, (state, { settings }) => ({
    ...state,
    settings,
  })),
  on(LiveDeckActions.left, () => initialLiveDeckState),
);