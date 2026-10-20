import type { CacheRepository } from '@/domain/repositories/cache_repository';
import { getEnvConfig } from '../config/env';

interface MemoryCacheEntry {
  serialized: string;
  expires_at: number | null;
}

export class RedisCacheRepository implements CacheRepository {
  private readonly fallbackMemory = new Map<string, MemoryCacheEntry>();
  private readonly prefix: string;

  constructor() {
    this.prefix = getEnvConfig().redis_key_prefix;
  }

  private withPrefix(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(cache_key: string): Promise<T | null> {
    const fullKey = this.withPrefix(cache_key);
    const entry = this.fallbackMemory.get(fullKey);
    if (!entry) {
      return null;
    }
    if (entry.expires_at && Date.now() > entry.expires_at) {
      this.fallbackMemory.delete(fullKey);
      return null;
    }
    return JSON.parse(entry.serialized) as T;
  }

  async set<T>(
    cache_key: string,
    value: T,
    ttl_seconds = 60,
  ): Promise<void> {
    const fullKey = this.withPrefix(cache_key);
    this.fallbackMemory.set(fullKey, {
      serialized: JSON.stringify(value),
      expires_at: ttl_seconds > 0 ? Date.now() + ttl_seconds * 1000 : null,
    });
  }

  async del(cache_key: string): Promise<void> {
    const fullKey = this.withPrefix(cache_key);
    this.fallbackMemory.delete(fullKey);
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

export const defaultCacheRepository = new RedisCacheRepository();
