import { AutoExitDecisionSlice } from '@alpha-trader/server-position';
import { AutoEntryPreferenceState } from '@alpha-trader/server-preferences';
import { TradingStyle } from '@alpha-trader/server-shared';
import {
  isEngineEntryBlockedByVeto,
  resolveEngineEntryThreshold,
} from './auto-entry-runner.js';

function basePref(
  patch: Partial<AutoEntryPreferenceState> = {},
): AutoEntryPreferenceState {
  return {
    enabled: true,
    dryRun: true,
    armedLive: false,
    armedLiveSessionDate: null,
    signalMode: 'engine',
    signalProfile: 'engine',
    entryThreshold: 60,
    lots: 1,
    maxEntriesPerDay: 3,
    greenDayStop: false,
    ignoreChartVeto: false,
    ...patch,
  };
}

function baseDecision(
  patch: Partial<AutoExitDecisionSlice> = {},
): AutoExitDecisionSlice {
  return {
    action: 'CE-BUY',
    conviction: 55,
    lastPrice: 24_500,
    tradeGuidance: { thresholdsForThisStyle: { enter: 40 } },
    priceAction: {
      overallSignal: { vetoReason: 'Hard decay veto: 35% decay' },
    },
    ...patch,
  };
}

describe('resolveEngineEntryThreshold', () => {
  it('uses the trading-style enter threshold when the generic default is unchanged', () => {
    expect(
      resolveEngineEntryThreshold(
        basePref(),
        baseDecision(),
        TradingStyle.Scalper,
      ),
    ).toBe(40);
  });

  it('keeps a customized auto-entry threshold above the style default', () => {
    expect(
      resolveEngineEntryThreshold(
        basePref({ entryThreshold: 70 }),
        baseDecision(),
        TradingStyle.Scalper,
      ),
    ).toBe(70);
  });

  it('keeps the intraday default when it matches the style threshold', () => {
    expect(
      resolveEngineEntryThreshold(
        basePref(),
        baseDecision({
          tradeGuidance: { thresholdsForThisStyle: { enter: 60 } },
        }),
        TradingStyle.Intraday,
      ),
    ).toBe(60);
  });
});

describe('isEngineEntryBlockedByVeto', () => {
  it('blocks engine entries when a hard chart gate is active', () => {
    expect(isEngineEntryBlockedByVeto(basePref(), baseDecision())).toBe(true);
  });

  it('does not block on soft structural reads (penalties only)', () => {
    expect(
      isEngineEntryBlockedByVeto(
        basePref(),
        baseDecision({
          priceAction: {
            overallSignal: { vetoReason: 'Double top forming' },
          },
        }),
      ),
    ).toBe(false);
  });

  it('allows engine entries when ignoreChartVeto is enabled', () => {
    expect(
      isEngineEntryBlockedByVeto(
        basePref({ ignoreChartVeto: true }),
        baseDecision(),
      ),
    ).toBe(false);
  });
});