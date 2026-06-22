export { registerDeckStreamPlugin } from './lib/register-deck-stream-plugin.js';
export {
  buildDeckLivePayload,
  buildDeckLiveFastPayload,
  buildDeckLiveStreamTick,
  runDeckAutoExitPoll,
  runDeckAutoEntryPoll,
  type DeckLivePayload,
  type DeckLiveStreamTick,
  type DeckPositionsLtpPatch,
  type DeckPositionsUpdate,
} from './lib/deck-service.js';
export {
  DeckStreamHub,
  createDeckStreamSubscriber,
  deckStreamChannelKey,
  type DeckStreamChannelParams,
} from './lib/deck-stream-hub.js';
export { buildDeckGauges, type DeckGauges } from './lib/deck-gauge.js';
export {
  buildDeckLiveEnrichmentPayload,
  buildDeckLiveStreamEnrichment,
  buildDeckReplayPayload,
  buildDeckReplayTradesPayload,
  type DeckLiveEnrichmentPayload,
  type DeckReplayPayload,
  type DeckReplayTradesPayload,
} from './lib/deck-replay.js';
export {
  fetchMarketNews,
  type MarketNewsItem,
  type MarketNewsPayload,
} from './lib/market-news.js';