import { PriceActionResponse } from '@alpha-trader/server-shared';
import { TradingStyle } from '@alpha-trader/server-shared';
import { FlowMode } from '@alpha-trader/server-shared';
import { VetoMode } from '@alpha-trader/server-shared';
import { TradeDecisionAlertPayload } from '@alpha-trader/server-shared';

export interface PollMarketDataContext {
  tradeDecisionCache: Map<string, TradeDecisionAlertPayload>;
  priceActionCache: Map<string, PriceActionResponse>;
}

export function createPollMarketDataContext(): PollMarketDataContext {
  return {
    tradeDecisionCache: new Map(),
    priceActionCache: new Map(),
  };
}

export function pollTradeDecisionCacheKey(
  symbol: string,
  tradingStyle: TradingStyle,
  vetoMode: VetoMode,
  flowMode: FlowMode = 'blend',
): string {
  return `${symbol}:${tradingStyle}:${vetoMode}:${flowMode}`;
}

export function pollPriceActionCacheKey(
  symbol: string,
  tradingStyle: TradingStyle,
): string {
  return `${symbol}:${tradingStyle}`;
}