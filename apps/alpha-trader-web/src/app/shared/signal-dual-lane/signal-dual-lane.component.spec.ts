import {
  directionFromOptionSignal,
  directionFromPaAction,
  formatOptionSignalLabel,
} from './signal-dual-lane.component';

describe('signal-dual-lane helpers', () => {
  it('maps PA actions to direction', () => {
    expect(directionFromPaAction('CE-BUY')).toBe('bullish');
    expect(directionFromPaAction('PE-BUY')).toBe('bearish');
    expect(directionFromPaAction('NO-TRADE')).toBe('neutral');
  });

  it('maps option signals to direction', () => {
    expect(directionFromOptionSignal('BULLISH_TRADE')).toBe('bullish');
    expect(directionFromOptionSignal('BEARISH_TRADE')).toBe('bearish');
    expect(directionFromOptionSignal('NEUTRAL')).toBe('neutral');
  });

  it('formats option signal labels', () => {
    expect(formatOptionSignalLabel('BULLISH_TRADE')).toBe('BULLISH FLOW');
    expect(formatOptionSignalLabel('BEARISH_TRADE')).toBe('BEARISH FLOW');
  });
});