// Constants
export * from './lib/constants/fyers-symbols.js';
export * from './lib/constants/fyers-market-stream.js';
export * from './lib/constants/fyers-order-stream.js';
export * from './lib/constants/market-data-cache.js';
export * from './lib/constants/open-positions-cache.js';
export * from './lib/constants/technical-analysis.js';
export * from './lib/constants/momentum-decay.js';
export * from './lib/constants/chase-decay.js';
export * from './lib/constants/benchmark.js';
export * from './lib/constants/position-sizing.js';
export * from './lib/constants/option-chain.js';
export * from './lib/constants/trade-rr.js';
export * from './lib/constants/session.js';
export * from './lib/constants/telegram-notifications.js';
export {
  STYLE_SCORING_CONFIG,
  getStyleScoringConfig,
} from './lib/constants/trading-style.js';

// Types
export * from './lib/types/index.js';

// Utils
export * from './lib/utils/error-message.js';
export * from './lib/utils/promise-timeout.js';
export * from './lib/utils/symbol-utils.js';

// Trading style enum + helpers (single export path)
export {
  TradingStyle,
  type StyleScoringConfig,
} from './lib/types/trading-style.js';

// Session helpers
export {
  computeDirectionalStreak,
  computeNoTradeStreak,
  hydrateSignalSnapshot,
  isIndianMarketOpen,
  getIstSessionClock,
  detectSignalChange,
} from './lib/session/signal-tracker.js';
export * from './lib/session/signal-exit-policy.js';