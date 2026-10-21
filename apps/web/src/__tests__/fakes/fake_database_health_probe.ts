import type { DatabaseHealthProbe } from '@/server/domain/repositories/database_health_probe';

export class FakeDatabaseHealthProbe implements DatabaseHealthProbe {
  public isHealthy = true;

  async ping(): Promise<boolean> {
    return this.isHealthy;
  }
}
