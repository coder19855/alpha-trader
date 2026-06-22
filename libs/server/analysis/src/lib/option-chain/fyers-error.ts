import { toErrorMessage } from '@alpha-trader/server-shared';

export function fyersErrorMessage(err: unknown): string {
  const message = toErrorMessage(err);
  if (/valid token|access token|appid|app id/i.test(message)) {
    return 'Fyers session expired or not connected. Use Connect Fyers in the top bar, then retry.';
  }
  return message;
}

export function isFyersAuthError(err: unknown): boolean {
  const message = toErrorMessage(err).toLowerCase();
  return (
    message.includes('valid token') ||
    message.includes('access token') ||
    message.includes('appid') ||
    message.includes('app id')
  );
}