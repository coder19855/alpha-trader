export { registerMarketDataPlugins } from './lib/register-market-data-plugins.js';

export {
  getOpenPositionsCacheSnapshot,
  getAllHeldOptionSymbols,
  getHeldOptionSymbolsForIndex,
  seedOpenPositionsCache,
  clearOpenPositionsCache,
  isOpenPositionsWsLive,
  mapFyersPositionRowToMonitorContext,
  getOpenPositionsWsStats,
} from './lib/open-positions-live-cache.js';

export {
  bindMarketStreamHooks,
  notifyOpenOutcomeSymbols,
  notifyWatchIndexSymbols,
  onQuoteTicksUpdated,
  notifyQuoteTicksUpdated,
} from './lib/market-stream-coordinator.js';

export { getQuoteCache } from './lib/quote-cache.js';
export { seedIndexQuotesFromRest } from './lib/seed-index-quotes.js';
export { getMarketDataStore } from './lib/market-data-store.js';
export {
  patchFyersCandlesWithLtp,
  patchLiveHistoryCandles,
} from './lib/live-history-candle-patch.js';
export {
  FyersMarketStreamManager,
  type MarketStreamStats,
} from './lib/fyers-market-stream-manager.js';
export { FyersOrderStreamManager } from './lib/fyers-order-stream-manager.js';

export { fetchFyersHistoryCandles } from './lib/fyers-history-range.js';

export {
  createPollMarketDataContext,
  pollPriceActionCacheKey,
  pollTradeDecisionCacheKey,
} from './lib/poll-market-data-context.js';
export type { PollMarketDataContext } from './lib/poll-market-data-context.js';