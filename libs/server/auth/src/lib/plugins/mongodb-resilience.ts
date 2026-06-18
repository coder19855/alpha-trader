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
): void {
  const onTransient = (err: unknown, context: string) => {
    log.warn(
      { err, context },
      'MongoDB transient network issue — server continues; Atlas may be briefly unreachable',
    );
  };

  client.on('error', (err) => onTransient(err, 'client'));
  client.on('serverHeartbeatFailed', (event) => {
    onTransient(event.failure, 'serverHeartbeatFailed');
  });
  client.on('connectionPoolCleared', (event) => {
    log.warn(
      { address: event.address },
      'MongoDB connection pool cleared after network blip',
    );
  });
}

export function registerMongoProcessSafetyHandlers(
  log: Pick<FastifyBaseLogger, 'warn' | 'error'>,
): void {
  process.on('unhandledRejection', (reason) => {
    if (!isMongoTransientNetworkError(reason)) return;
    log.warn(
      { err: reason },
      'Suppressed unhandled MongoDB network rejection',
    );
  });

  process.on('uncaughtException', (err) => {
    if (!isMongoTransientNetworkError(err)) return;
    log.warn(
      { err },
      'Suppressed uncaught MongoDB network exception — process kept alive',
    );
  });
}