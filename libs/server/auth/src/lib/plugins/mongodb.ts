import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { MongoClient, ObjectId } from 'mongodb';
import { ensureMongoStorageIndexes } from '../mongo-storage.js';
import {
  attachMongoClientErrorHandlers,
  resolveMongoClientOptions,
} from './mongodb-resilience.js';

function parseDatabaseName(url: string): string | undefined {
  const match = url.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
  return match?.[1] || undefined;
}

function isLocalMongoUrl(url: string): boolean {
  return /mongodb(?:\+srv)?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(url);
}

/** Hosted platforms where a localhost MONGODB_URL is never reachable. */
function isCloudDeployEnvironment(): boolean {
  return Boolean(
    process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      process.env.VERCEL ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.HEROKU_APP_NAME ||
      process.env.K_SERVICE ||
      process.env.AWS_EXECUTION_ENV,
  );
}

const mongodbPlugin = fp(
  async (fastify: FastifyInstance) => {
    const url = process.env.MONGODB_URL;
    if (!url) {
      fastify.log.warn(
        'MONGODB_URL not set — skipping mongodb plugin registration',
      );
      return;
    }

    if (isLocalMongoUrl(url) && isCloudDeployEnvironment()) {
      fastify.log.warn(
        'MONGODB_URL points to localhost — skipping mongodb on cloud deploy',
      );
      return;
    }

    const client = new MongoClient(url, resolveMongoClientOptions());
    attachMongoClientErrorHandlers(client, fastify.log);

    try {
      await client.connect();
      const dbName = parseDatabaseName(url);
      const db = dbName ? client.db(dbName) : client.db();
      await db.command({ ping: 1 });

      fastify.decorate('mongo', { client, ObjectId, db });
      fastify.addHook('onClose', async () => {
        await client.close(true);
      });
      void ensureMongoStorageIndexes(fastify).catch((err) => {
        fastify.log.warn({ err }, 'Mongo storage index setup failed');
      });

      fastify.log.info(
        { database: db.databaseName },
        'MongoDB connected',
      );
    } catch (err) {
      await client.close(true).catch(() => undefined);
      fastify.log.error(
        { err },
        'MongoDB unavailable — server starting without persistence.',
      );
    }
  },
  { name: 'mongodb' },
);

export default mongodbPlugin;

export async function registerMongoPlugin(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(mongodbPlugin);
}