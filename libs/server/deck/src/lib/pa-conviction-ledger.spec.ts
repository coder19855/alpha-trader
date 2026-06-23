import { buildPaConvictionLedger } from './pa-conviction-ledger.js';

describe('buildPaConvictionLedger', () => {
  it('reconstructs base from penalties so the breakdown adds up', () => {
    const ledger = buildPaConvictionLedger({
      confidence: 52,
      confidenceBeforeDecay: 68,
      entryPenalties: [
        { label: '5m opposes CE', points: 8 },
        { label: 'Bearish chart pattern', points: 11 },
      ],
      momentumDecayPercent: 0.12,
    });

    expect(ledger.entryConviction).toBe(52);
    expect(ledger.bonuses).toHaveLength(2);
    const total =
      ledger.baseConviction +
      ledger.bonuses.reduce((sum, row) => sum + row.points, 0);
    expect(total).toBe(52);
    expect(ledger.baseConviction).toBe(71);
  });
});