import { buildOcBrief } from './option-signal-brief.utils';

const baseGuard = {
  spotLtp: 24500,
  atmStrike: 24500,
  maxPain: 24400,
  pcr: 1.15,
  callOiTotal: 1_000_000,
  putOiTotal: 1_150_000,
  supportStrike: 24400,
  resistanceStrike: 24600,
  intradaySupport: 24450,
  intradayResistance: 24550,
  indiaVix: 14.2,
  levels: [],
};

describe('buildOcBrief', () => {
  it('builds bullish actionable copy with PA confirm', () => {
    const brief = buildOcBrief({
      fetchedAt: '2026-06-23T10:15:00.000Z',
      cached: false,
      symbol: 'NIFTY',
      tradingStyle: 'intraday',
      score: 62,
      signal: 'BULLISH_FLOW',
      bias: 'Call writers adding OI below spot.',
      ivRegime: 'Normal',
      conviction: 68,
      componentRows: [],
      guard: baseGuard,
      paAlignment: 'confirm',
      paAlignmentDetail: 'Option flow aligns with PA CE bias.',
    });

    expect(brief.headline).toContain('Bullish');
    expect(brief.summary).toContain('aligns with PA');
    expect(brief.bullets[0]).toContain('confirms PA');
  });

  it('flags PA veto in headline', () => {
    const brief = buildOcBrief({
      fetchedAt: '2026-06-23T10:20:00.000Z',
      cached: false,
      symbol: 'NIFTY',
      tradingStyle: 'intraday',
      score: -40,
      signal: 'BEARISH_FLOW',
      bias: 'Put buildup',
      ivRegime: 'Elevated',
      conviction: 61,
      componentRows: [],
      guard: baseGuard,
      paAlignment: 'veto',
      paAlignmentDetail: 'Bearish flow vs bullish PA.',
    });

    expect(brief.headline).toContain('conflicts');
    expect(brief.bullets[0]).toContain('Do not let option flow override PA');
  });
});