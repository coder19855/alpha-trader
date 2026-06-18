import { diffSymbolSets } from './subscription-symbols.js';

describe('diffSymbolSets', () => {
  it('returns subscribe and unsubscribe symbol lists', () => {
    const result = diffSymbolSets(
      new Set(['NSE:NIFTY50-INDEX', 'NSE:NIFTY24JUN24900CE']),
      new Set(['NSE:NIFTY50-INDEX', 'NSE:NIFTY24JUN24800CE']),
    );

    expect(result.subscribe).toEqual(['NSE:NIFTY24JUN24900CE']);
    expect(result.unsubscribe).toEqual(['NSE:NIFTY24JUN24800CE']);
  });
});