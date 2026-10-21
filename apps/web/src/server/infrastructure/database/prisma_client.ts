import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { getEnvConfig } from '../config/env';
import { PrismaClient } from './generated/client';

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    // Prisma 7's pg adapter defaults to no connect timeout, so an unreachable
    // database would hang every request (and `next build` page-data collection)
    // instead of failing fast.
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

// `next dev` re-evaluates modules on every hot reload. A module-level
// singleton would therefore be rebuilt each time, leaking one connection pool
// per reload until Postgres runs out of connections. `globalThis` survives
// reloads. In production modules load once, so the cache is skipped there.
const globalForPrisma = globalThis as unknown as {
  __sineva_prisma?: PrismaClient;
};

let productionInstance: PrismaClient | null = null;

/** Lazy: nothing connects (or even reads env) until the first call. */
export function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    productionInstance ??= createPrismaClient(getEnvConfig().database_url);
    return productionInstance;
  }
  globalForPrisma.__sineva_prisma ??= createPrismaClient(
    getEnvConfig().database_url,
  );
  return globalForPrisma.__sineva_prisma;
}
