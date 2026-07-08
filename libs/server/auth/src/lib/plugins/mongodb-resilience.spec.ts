import { EventEmitter } from 'events';
import type { FastifyBaseLogger } from 'fastify';
import type { MongoClient } from 'mongodb';
import {
  attachMongoClientErrorHandlers,
  registerMongoProcessSafetyHandlers,
  unregisterMongoProcessSafetyHandlers,
} from './mongodb-resilience.js';

describe('mongodb-resilience', () => {
  const log = {
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Pick<FastifyBaseLogger, 'warn' | 'error'>;

  afterEach(() => {
    unregisterMongoProcessSafetyHandlers();
    jest.clearAllMocks();
  });

  it('attaches mongo client listeners only once per client', () => {
    const client = new EventEmitter() as MongoClient & EventEmitter;

    const cleanup = attachMongoClientErrorHandlers(
      client,
      log as FastifyBaseLogger,
    );
    attachMongoClientErrorHandlers(client, log as FastifyBaseLogger);

    expect(client.listenerCount('error')).toBe(1);
    expect(client.listenerCount('serverHeartbeatFailed')).toBe(1);
    expect(client.listenerCount('connectionPoolCleared')).toBe(1);

    cleanup();

    expect(client.listenerCount('error')).toBe(0);
    expect(client.listenerCount('serverHeartbeatFailed')).toBe(0);
    expect(client.listenerCount('connectionPoolCleared')).toBe(0);
  });

  it('installs mongo process safety handlers idempotently', () => {
    const beforeUnhandled = process.listenerCount('unhandledRejection');
    const beforeUncaught = process.listenerCount('uncaughtException');

    const cleanup = registerMongoProcessSafetyHandlers(log);
    registerMongoProcessSafetyHandlers(log);

    expect(process.listenerCount('unhandledRejection')).toBe(beforeUnhandled + 1);
    expect(process.listenerCount('uncaughtException')).toBe(beforeUncaught + 1);

    cleanup();

    expect(process.listenerCount('unhandledRejection')).toBe(beforeUnhandled);
    expect(process.listenerCount('uncaughtException')).toBe(beforeUncaught);
  });
});
