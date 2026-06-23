import { buildPaBrief } from './pa-signal-brief.utils';

describe('buildPaBrief', () => {
  it('builds actionable copy when entry gate is met', () => {
    const brief = buildPaBrief({
      action: 'BUY CE',
      structuralAction: 'BUY CE',
      conviction: 72,
      entryThreshold: 60,
      tfAligned: 3,
      tfAlignedTotal: 3,
      signalAt: '2026-06-23T10:15:00.000Z',
      bias: 'Bullish continuation on 15m structure.',
    });

    expect(brief.headline).toContain('ready');
    expect(brief.summary).toContain('Bullish continuation');
    expect(brief.bullets[0]).toContain('BUY CE');
    expect(brief.fingerprint).toBeTruthy();
  });

  it('tracks veto state in headline and bullets', () => {
    const brief = buildPaBrief({
      action: 'NO-TRADE',
      structuralAction: 'BUY CE',
      conviction: 68,
      entryThreshold: 60,
      chartVetoed: true,
      vetoReason: 'Double top rejection',
      signalAt: '2026-06-23T10:20:00.000Z',
    });

    expect(brief.headline).toContain('veto');
    expect(brief.bullets[0]).toContain('Double top rejection');
  });
});