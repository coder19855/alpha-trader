import type { FastifyBaseLogger } from 'fastify';
import type { MongoClient, MongoClientOptions } from 'mongodb';

const TRANSIENT_MONGO_ERROR_NAMES = new Set([
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoTimeoutError',
  'MongoPoolClearedError',
]);

export function isMongoTransientNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  if (name && TRANSIENT_MONGO_ERROR_NAMES.has(name)) return true;

  const cause = (err as { cause?: unknown }).cause;
  return isMongoTransientNetworkError(cause);
}

export function resolveMongoClientOptions(): MongoClientOptions {
  return {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    heartbeatFrequencyMS: 10_000,
    maxIdleTimeMS: 60_000,
    retryWrites: true,
    retryReads: true,
    maxPoolSize: 10,
  };
}

export function attachMongoClientErrorHandlers(
  client: MongoClient,
  log: FastifyBaseLogger,
): () => void {
  const existing = clientErrorHandlerCleanup.get(client);
  if (existing) return existing;

  const onTransient = (err: unknown, context: string) => {
    log.warn(
      { err, context },
      'MongoDB transient network issue — server continues; Atlas may be briefly unreachable',
    );
  };

  const onError = (err: unknown) => onTransient(err, 'client');
  const onServerHeartbeatFailed = (event: { failure: unknown }) => {
    onTransient(event.failure, 'serverHeartbeatFailed');
  };
  const onConnectionPoolCleared = (event: { address: string }) => {
    log.warn(
      { address: event.address },
      'MongoDB connection pool cleared after network blip',
    );
  };

  client.on('error', onError);
  client.on('serverHeartbeatFailed', onServerHeartbeatFailed);
  client.on('connectionPoolCleared', onConnectionPoolCleared);

  const cleanup = () => {
    if (clientErrorHandlerCleanup.get(client) !== cleanup) return;
    client.off('error', onError);
    client.off('serverHeartbeatFailed', onServerHeartbeatFailed);
    client.off('connectionPoolCleared', onConnectionPoolCleared);
    clientErrorHandlerCleanup.delete(client);
  };

  clientErrorHandlerCleanup.set(client, cleanup);
  return cleanup;
}

export function registerMongoProcessSafetyHandlers(
  log: Pick<FastifyBaseLogger, 'warn' | 'error'>,
): () => void {
  mongoProcessSafetyLog = log;
  if (!mongoProcessSafetyHandlersInstalled) {
    process.on('unhandledRejection', onMongoUnhandledRejection);
    process.on('uncaughtException', onMongoUncaughtException);
    mongoProcessSafetyHandlersInstalled = true;
  }
  return unregisterMongoProcessSafetyHandlers;
}

export function unregisterMongoProcessSafetyHandlers(): void {
  if (!mongoProcessSafetyHandlersInstalled) return;
  process.off('unhandledRejection', onMongoUnhandledRejection);
  process.off('uncaughtException', onMongoUncaughtException);
  mongoProcessSafetyHandlersInstalled = false;
  mongoProcessSafetyLog = undefined;
}

const clientErrorHandlerCleanup = new WeakMap<MongoClient, () => void>();
let mongoProcessSafetyLog: Pick<FastifyBaseLogger, 'warn' | 'error'> | undefined;
let mongoProcessSafetyHandlersInstalled = false;

const onMongoUnhandledRejection = (reason: unknown) => {
  if (!isMongoTransientNetworkError(reason)) return;
  mongoProcessSafetyLog?.warn(
    { err: reason },
    'Suppressed unhandled MongoDB network rejection',
  );
};

const onMongoUncaughtException = (err: unknown) => {
  if (!isMongoTransientNetworkError(err)) return;
  mongoProcessSafetyLog?.warn(
    { err },
    'Suppressed uncaught MongoDB network exception — process kept alive',
  );
};