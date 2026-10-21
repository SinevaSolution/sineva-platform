import type { CacheRepository } from '@/server/domain/repositories/cache_repository';

/** Map-backed cache that ignores TTLs, so tests never depend on the clock. */
export class FakeCache implements CacheRepository {
  public readonly entries = new Map<string, unknown>();
  public isHealthy = true;

  async get<T>(cache_key: string): Promise<T | null> {
    return (this.entries.get(cache_key) as T | undefined) ?? null;
  }

  async set<T>(cache_key: string, value: T): Promise<void> {
    this.entries.set(cache_key, value);
  }

  async del(cache_key: string): Promise<void> {
    this.entries.delete(cache_key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  async ping(): Promise<boolean> {
    return this.isHealthy;
  }
}
