import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { VaultUnavailableError } from '@/server/domain/vault/vault';
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
  __sineva_vault_prisma?: PrismaClient;
};

let productionInstance: PrismaClient | null = null;

/**
 * Client for the vault table only (ADR-0036). With `VAULT_DATABASE_URL` it
 * connects as the vault role, the one role with privileges on `vault_secrets`.
 * Without it, development and tests share the main client; production refuses
 * to, because that would give the application role the vault, which is the
 * separation this exists for. Not exported through the container: only the
 * vault repository is built from it.
 */
export function resolveVaultDatabaseUrl(config: {
  node_env: string;
  database_url: string;
  vault_database_url?: string;
}): string {
  if (config.vault_database_url) {
    return config.vault_database_url;
  }
  if (config.node_env === 'production') {
    throw new VaultUnavailableError('VAULT_DATABASE_URL is required in production (the vault must use its own database role)');
  }
  return config.database_url;
}

export function getVaultPrismaClient(): PrismaClient {
  const config = getEnvConfig();
  const url = resolveVaultDatabaseUrl(config);
  if (url === config.database_url) {
    return getPrismaClient();
  }
  globalForPrisma.__sineva_vault_prisma ??= createPrismaClient(url);
  return globalForPrisma.__sineva_vault_prisma;
}

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
