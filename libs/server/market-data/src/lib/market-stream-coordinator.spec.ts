import {
  notifyQuoteTicksUpdated,
  onQuoteTicksUpdated,
} from './market-stream-coordinator';

describe('market-stream-coordinator quote listeners', () => {
  it('notifies subscribed listeners with unique symbols', () => {
    const seen: string[][] = [];
    const unsubscribe = onQuoteTicksUpdated((symbols) => {
      seen.push(symbols);
    });

    notifyQuoteTicksUpdated([
      'NSE:NIFTY50-INDEX',
      'NSE:NIFTY50-INDEX',
      'NSE:NIFTY25JUN24500CE',
    ]);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      'NSE:NIFTY50-INDEX',
      'NSE:NIFTY25JUN24500CE',
    ]);

    unsubscribe();
    notifyQuoteTicksUpdated(['NSE:BANKNIFTY-INDEX']);
    expect(seen).toHaveLength(1);
  });
});