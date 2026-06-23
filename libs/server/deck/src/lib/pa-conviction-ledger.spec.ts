import { buildPaConvictionLedger } from './pa-conviction-ledger.js';

describe('buildPaConvictionLedger', () => {
  it('uses the full PA bonus ledger so the breakdown adds up', () => {
    const ledger = buildPaConvictionLedger({
      confidence: 72,
      confidenceBeforeDecay: 78,
      baseConviction: 50,
      convictionBonuses: [
        { label: 'PA + option same direction', points: 18 },
        { label: 'Strong option flow', points: 10 },
        { label: 'High IV regime', points: -4 },
        { label: 'Momentum decay (12%)', points: -2 },
      ],
      momentumDecayPercent: 0.12,
    });

    expect(ledger.entryConviction).toBe(72);
    expect(ledger.bonuses).toHaveLength(4);
    const total =
      ledger.baseConviction +
      ledger.bonuses.reduce((sum, row) => sum + row.points, 0);
    expect(total).toBe(72);
    expect(ledger.baseConviction).toBe(50);
  });

  it('still supports penalty-only input for legacy callers', () => {
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
  });
});