import { detectSecondEntry } from './decision-memory';

describe('detectSecondEntry', () => {
  it('returns false for empty or single-entry history', () => {
    expect(detectSecondEntry([], 'CE-BUY')).toBe(false);
    expect(detectSecondEntry(['CE-BUY'], 'CE-BUY')).toBe(false);
  });

  it('detects H2 when pause immediately precedes re-entry', () => {
    expect(detectSecondEntry(['CE-BUY', 'NO-TRADE'], 'CE-BUY')).toBe(true);
    expect(detectSecondEntry(['PE-BUY', 'NEUTRAL'], 'PE-BUY')).toBe(true);
  });

  it('rejects unordered pause and prior same-direction trigger', () => {
    expect(detectSecondEntry(['CE-BUY', 'PE-BUY', 'NO-TRADE'], 'CE-BUY')).toBe(
      false,
    );
  });

  it('does not re-apply after continuation entries', () => {
    expect(
      detectSecondEntry(['CE-BUY', 'NO-TRADE', 'CE-BUY'], 'CE-BUY'),
    ).toBe(false);
  });

  it('ignores opposite-direction entries as pause', () => {
    expect(detectSecondEntry(['CE-BUY', 'PE-BUY'], 'CE-BUY')).toBe(false);
  });
});