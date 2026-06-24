import type { FastifyBaseLogger } from 'fastify';

/** Normalize Fyers / API errors that are plain objects, not Error instances. */
export function formatUnknownError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const record = err as { message?: unknown; code?: unknown };
    const message =
      record.message != null ? String(record.message) : 'Unknown error';
    const code = record.code;
    if (code != null && code !== '') {
      return `${message} (${code})`;
    }
    return message;
  }
  return String(err);
}

export function isFyersRateLimitError(err: unknown): boolean {
  return (
    err != null &&
    typeof err === 'object' &&
    (err as { code?: number }).code === 429
  );
}

/** Fire-and-forget async work — never let rejections escape to the process. */
export function runDetached(
  task: Promise<unknown>,
  log: FastifyBaseLogger,
  label: string,
  context?: Record<string, unknown>,
): void {
  void task.catch((err) => {
    log.warn({ err, ...context }, label);
  });
}

export function installProcessAsyncGuards(
  log?: Pick<FastifyBaseLogger, 'warn' | 'error'>,
): void {
  const report = (kind: string, err: unknown) => {
    const payload = { err, kind };
    if (log) {
      log.warn(payload, kind);
      return;
    }
    console.error(kind, err);
  };

  process.on('unhandledRejection', (reason) => {
    report('Unhandled promise rejection', reason);
  });

  process.on('uncaughtException', (err) => {
    report('Uncaught exception', err);
  });
}