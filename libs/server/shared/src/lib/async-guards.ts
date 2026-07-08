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

let processAsyncGuardsLog: Pick<FastifyBaseLogger, 'warn' | 'error'> | undefined;
let processAsyncGuardsInstalled = false;

const reportProcessAsyncGuardError = (kind: string, err: unknown) => {
  const payload = { err, kind };
  if (processAsyncGuardsLog) {
    processAsyncGuardsLog.warn(payload, kind);
    return;
  }
  console.error(kind, err);
};

const onUnhandledRejection = (reason: unknown) => {
  reportProcessAsyncGuardError('Unhandled promise rejection', reason);
};

const onUncaughtException = (err: unknown) => {
  reportProcessAsyncGuardError('Uncaught exception', err);
};

export function installProcessAsyncGuards(
  log?: Pick<FastifyBaseLogger, 'warn' | 'error'>,
): () => void {
  processAsyncGuardsLog = log;
  if (!processAsyncGuardsInstalled) {
    process.on('unhandledRejection', onUnhandledRejection);
    process.on('uncaughtException', onUncaughtException);
    processAsyncGuardsInstalled = true;
  }
  return uninstallProcessAsyncGuards;
}

export function uninstallProcessAsyncGuards(): void {
  if (!processAsyncGuardsInstalled) return;
  process.off('unhandledRejection', onUnhandledRejection);
  process.off('uncaughtException', onUncaughtException);
  processAsyncGuardsInstalled = false;
  processAsyncGuardsLog = undefined;
}