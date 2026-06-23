import { PriceActionResponse } from '@alpha-trader/server-shared';

export type DeckTradeSetupPayload = NonNullable<PriceActionResponse['tradeSetup']>;
export type DeckComponentSignalsPayload = NonNullable<
  PriceActionResponse['componentSignals']
>;

export function extractDeckPaExtras(decision: {
  tradeSetup?: DeckTradeSetupPayload | null;
  _debug?: { rawPrice?: PriceActionResponse };
}): {
  tradeSetup: DeckTradeSetupPayload | null;
  componentSignals?: DeckComponentSignalsPayload;
  primaryTimeframe?: string;
} {
  const raw = decision._debug?.rawPrice;
  return {
    tradeSetup: decision.tradeSetup ?? raw?.tradeSetup ?? null,
    componentSignals: raw?.componentSignals,
    primaryTimeframe: raw?.primaryTimeframe,
  };
}