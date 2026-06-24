import {
  formatFyersPlaceOrderError,
  parseFyersPlaceOrderOutcome,
} from './fyers-place-order.js';

describe('parseFyersPlaceOrderOutcome', () => {
  it('accepts ok responses with id', () => {
    const outcome = parseFyersPlaceOrderOutcome({ s: 'ok', id: '12345' });
    expect(outcome.ok).toBe(true);
    expect(outcome.orderId).toBe('12345');
    expect(outcome.error).toBeNull();
  });

  it('surfaces Fyers error objects instead of [object Object]', () => {
    const outcome = parseFyersPlaceOrderOutcome({
      s: 'error',
      code: -50,
      message: 'symbol does not exist',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('symbol does not exist');
  });

  it('formats thrown Fyers payloads', () => {
    const message = formatFyersPlaceOrderError({
      s: 'error',
      code: -99,
      message: 'Insufficient funds',
    });
    expect(message).toContain('Insufficient funds');
    expect(message).not.toContain('[object Object]');
  });
});