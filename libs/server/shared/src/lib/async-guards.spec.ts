import {
  formatUnknownError,
  isFyersRateLimitError,
  installProcessAsyncGuards,
  uninstallProcessAsyncGuards,
} from './async-guards.js';

describe('async-guards', () => {
  afterEach(() => {
    uninstallProcessAsyncGuards();
  });

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

  it('installs process guards idempotently and removes them cleanly', () => {
    const beforeUnhandled = process.listenerCount('unhandledRejection');
    const beforeUncaught = process.listenerCount('uncaughtException');

    const cleanup = installProcessAsyncGuards();
    installProcessAsyncGuards();

    expect(process.listenerCount('unhandledRejection')).toBe(beforeUnhandled + 1);
    expect(process.listenerCount('uncaughtException')).toBe(beforeUncaught + 1);

    cleanup();

    expect(process.listenerCount('unhandledRejection')).toBe(beforeUnhandled);
    expect(process.listenerCount('uncaughtException')).toBe(beforeUncaught);
  });
});