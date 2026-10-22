import 'server-only';
import type { DatabaseHealthProbe } from '@/server/domain/repositories/database_health_probe';
import type { PrismaClient } from './generated/client';

const DB_PING_TIMEOUT_MS = 2000;

export class PrismaDatabaseHealthProbe implements DatabaseHealthProbe {
  constructor(private readonly db: PrismaClient) {}

  async ping(): Promise<boolean> {
    try {
      const pingPromise = this.db.$queryRaw`SELECT 1`;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('PostgreSQL health probe timed out')),
          DB_PING_TIMEOUT_MS,
        );
      });
      await Promise.race([pingPromise, timeoutPromise]);
      return true;
    } catch {
      return false;
    }
  }
}
