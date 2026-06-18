import { FastifyInstance } from 'fastify';

const ACCESS_TOKEN_DOC_ID = 'latest';

export async function ensureMongoStorageIndexes(
  _fastify: FastifyInstance,
): Promise<void> {
  // Phase 1: access-tokens collection only — no TTL indexes required.
}

export async function upsertLatestAccessToken(
  fastify: FastifyInstance,
  token: string,
): Promise<void> {
  const col = fastify.mongo?.db?.collection<{
    _id: string;
    token: string;
    timestamp: number;
  }>('access-tokens');
  if (!col) {
    fastify.log.error(
      'Cannot persist Fyers access token — MongoDB is not connected',
    );
    return;
  }

  await col.updateOne(
    { _id: ACCESS_TOKEN_DOC_ID },
    { $set: { token, timestamp: Date.now() } },
    { upsert: true },
  );
}

/** Test-only reset */
export function resetMongoStorageForTests(): void {
  // no-op for Phase 1 slim storage
}