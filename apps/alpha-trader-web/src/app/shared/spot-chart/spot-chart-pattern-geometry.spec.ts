import {
  buildChartPatternOps,
  isValidChartPattern,
  selectChartPatternsToPlot,
} from './spot-chart-pattern-geometry';

describe('spot-chart-pattern-geometry', () => {
  const candles = Array.from({ length: 40 }, (_, i) => {
    const wave = Math.sin(i / 3) * 20;
    const base = 24_500 + i * 2 + wave;
    return {
      t: 1_700_000_000_000 + i * 300_000,
      o: base,
      h: base + 8,
      l: base - 8,
      c: base + (i % 2 === 0 ? 2 : -2),
    };
  });

  it('selects up to two valid chart patterns for the active timeframe', () => {
    const insights = [
      {
        timeframe: '15m',
        pattern: 'double top',
        tone: 'bear',
        label: 'Chart Pattern',
        type: 'chart' as const,
        status: 'forming',
      },
      {
        timeframe: '5m',
        pattern: 'bull flag',
        tone: 'bull',
        label: 'Chart Pattern',
        type: 'chart' as const,
        status: 'confirmed',
      },
      {
        timeframe: '15m',
        pattern: 'hammer',
        tone: 'bull',
        label: 'Candlestick',
        type: 'candlestick' as const,
      },
    ];

    const selected = selectChartPatternsToPlot(insights, '15m', 2);
    expect(selected).toHaveLength(1);
    expect(selected[0].pattern).toBe('double top');
    expect(selectChartPatternsToPlot(insights, '5m', 2)).toHaveLength(1);
    expect(isValidChartPattern(insights[2])).toBe(false);
  });

  it('builds geometry ops for a chart pattern', () => {
    const ops = buildChartPatternOps(
      {
        timeframe: '15m',
        pattern: 'triangle symmetric',
        tone: 'neutral',
        label: 'Chart Pattern',
        type: 'chart',
        status: 'forming',
      },
      candles,
    );
    expect(ops.length).toBeGreaterThan(0);
  });

  it('draws swing connectivity from server-provided pivots', () => {
    const ops = buildChartPatternOps(
      {
        timeframe: '15m',
        pattern: 'head and shoulders',
        tone: 'bear',
        label: 'Chart Pattern',
        type: 'chart',
        status: 'forming',
        neckline: 24_520,
        points: [
          { index: 10, price: 24_540, kind: 'high', t: candles[10].t },
          { index: 18, price: 24_560, kind: 'high', t: candles[18].t },
          { index: 26, price: 24_538, kind: 'high', t: candles[26].t },
        ],
      },
      candles,
    );
    const outline = ops.find((op) => op.id === 'server-outline');
    expect(outline?.kind).toBe('polyline');
    expect(outline?.points).toHaveLength(3);
    expect(ops.some((op) => op.kind === 'dot')).toBe(true);
    expect(ops.some((op) => op.kind === 'hline' && op.label === 'Neckline')).toBe(true);
  });
});