import {
  formatUnknownError,
  isFyersRateLimitError,
} from './async-guards.js';

describe('async-guards', () => {
  it('formats plain Fyers error objects', () => {
    expect(
      formatUnknownError({ message: 'request limit reached', code: 429 }),
    ).toBe('request limit reached (429)');
  });

  it('detects Fyers 429 rate limits', () => {
    expect(isFyersRateLimitError({ code: 429, message: 'request limit reached' })).toBe(
      true,
    );
    expect(isFyersRateLimitError(new Error('nope'))).toBe(false);
  });
});