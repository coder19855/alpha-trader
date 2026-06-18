import 'fastify';
import type { Db, MongoClient, ObjectId } from 'mongodb';
import type { fyersModel } from 'fyers-api-v3';

declare module 'fastify' {
  interface FastifyInstance {
    fyers: fyersModel;
    mongo?: {
      client: MongoClient;
      ObjectId: typeof ObjectId;
      db?: Db;
    };
  }
}

export {};