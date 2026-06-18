import {
  formatNoTradeWindows,
  isWithinNoTradeWindow,
  parseNoTradeWindowToken,
  parseNoTradeWindows,
} from './no-trade-window';

describe('no-trade-window', () => {
  it('parses HH:MM-HH:MM ranges', () => {
    expect(parseNoTradeWindowToken('9:15-9:30')).toEqual({
      startHour: 9,
      startMinute: 15,
      endHour: 9,
      endMinute: 30,
    });
    expect(parseNoTradeWindowToken('09:15-09:30')).toEqual({
      startHour: 9,
      startMinute: 15,
      endHour: 9,
      endMinute: 30,
    });
  });

  it('parses compact and multi-line lists', () => {
    expect(parseNoTradeWindows('9:15-9:30, 12:00-12:15')).toHaveLength(2);
    expect(parseNoTradeWindows('0915-0930\n12:00-12:15')).toHaveLength(2);
    expect(formatNoTradeWindows(parseNoTradeWindows('9:15-9:30'))).toBe(
      '09:15-09:30',
    );
  });

  it('blocks entries inside configured windows (IST)', () => {
    const windows = parseNoTradeWindows('9:15-9:30');
    const inside = Date.parse('2026-06-17T03:52:00.000Z'); // 09:22 IST
    const outside = Date.parse('2026-06-17T04:00:00.000Z'); // 09:30 IST
    expect(isWithinNoTradeWindow(inside, windows)).toBe(true);
    expect(isWithinNoTradeWindow(outside, windows)).toBe(false);
  });
});