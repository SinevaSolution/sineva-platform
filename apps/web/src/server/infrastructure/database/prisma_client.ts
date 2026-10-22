import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { getEnvConfig } from '../config/env';
import { PrismaClient } from './generated/client';

/**
 * Pool settings for the pg adapter. `max` is per app instance: on serverless
 * hosting every warm instance has its own pool, so total connections are
 * roughly instances times `max`. Keep it small there and point the URL at the
 * provider's pooled endpoint.
 */
export function buildPoolConfig(connectionString: string, max: number) {
  return {
    connectionString,
    // Prisma 7's pg adapter defaults to no connect timeout, so an unreachable
    // database would hang every request (and `next build` page-data collection)
    // instead of failing fast.
    connectionTimeoutMillis: 5_000,
    max,
  };
}

// Callers that pass only a URL (integration tests) keep the pg default of 10.
export function createPrismaClient(connectionString: string, poolMax = 10): PrismaClient {
  const adapter = new PrismaPg(buildPoolConfig(connectionString, poolMax));
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
    const env = getEnvConfig();
    productionInstance ??= createPrismaClient(env.database_url, env.database_pool_max);
    return productionInstance;
  }
  const env = getEnvConfig();
  globalForPrisma.__sineva_prisma ??= createPrismaClient(
    env.database_url,
    env.database_pool_max,
  );
  return globalForPrisma.__sineva_prisma;
}
