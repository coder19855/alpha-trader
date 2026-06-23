import { OptionMetricsResponse, TradingStyle } from '@alpha-trader/server-shared';
import {
  clearOptionOverlay,
  optionOverlayKey,
  readOptionOverlay,
  setOptionOverlay,
} from './option-overlay-cache.js';

const metrics: OptionMetricsResponse = {
  spotSymbol: 'NSE:NIFTY50-INDEX',
  spotLtp: 22000,
  spotLtpChangePercent: 0.4,
  score: 38,
  signal: 'BULLISH_TRADE',
  bias: 'Moderate Bullish',
  ivRegime: 'Normal IV',
};

describe('option-overlay-cache', () => {
  beforeEach(() => clearOptionOverlay());

  it('keys by symbol and style', () => {
    expect(optionOverlayKey('NSE:NIFTY50-INDEX', TradingStyle.Intraday)).toBe(
      'NSE:NIFTY50-INDEX::INTRADAY',
    );
    expect(
      optionOverlayKey('NSE:NIFTY50-INDEX', TradingStyle.Intraday),
    ).not.toBe(optionOverlayKey('NSE:NIFTY50-INDEX', TradingStyle.Scalper));
  });

  it('returns missing when nothing cached', () => {
    const read = readOptionOverlay('NSE:NIFTY50-INDEX', TradingStyle.Intraday, 1000);
    expect(read.status).toBe('missing');
    expect(read.metrics).toBeNull();
    expect(read.ageMs).toBeNull();
  });

  it('returns fresh metrics within the max-age window', () => {
    setOptionOverlay('NSE:NIFTY50-INDEX', TradingStyle.Intraday, metrics, 1000);
    const read = readOptionOverlay(
      'NSE:NIFTY50-INDEX',
      TradingStyle.Intraday,
      1000 + 50_000,
      90_000,
    );
    expect(read.status).toBe('fresh');
    expect(read.ageMs).toBe(50_000);
    expect(read.metrics?.score).toBe(38);
  });

  it('returns stale (no metrics) once past the max-age window', () => {
    setOptionOverlay('NSE:NIFTY50-INDEX', TradingStyle.Intraday, metrics, 1000);
    const read = readOptionOverlay(
      'NSE:NIFTY50-INDEX',
      TradingStyle.Intraday,
      1000 + 120_000,
      90_000,
    );
    expect(read.status).toBe('stale');
    expect(read.ageMs).toBe(120_000);
    expect(read.metrics).toBeNull();
  });

  it('does not blend one style into another', () => {
    setOptionOverlay('NSE:NIFTY50-INDEX', TradingStyle.Intraday, metrics, 1000);
    const other = readOptionOverlay(
      'NSE:NIFTY50-INDEX',
      TradingStyle.Scalper,
      1000,
    );
    expect(other.status).toBe('missing');
  });
});
