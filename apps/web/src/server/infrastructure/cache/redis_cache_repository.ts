import 'server-only';
import type Redis from 'ioredis';
import type { CacheRepository } from '@/server/domain/repositories/cache_repository';
import { getEnvConfig } from '../config/env';
import { ensureRedisReady, getRedisClient } from './redis_client';

export class RedisCacheRepository implements CacheRepository {
  private readonly prefix: string;
  private readonly client: Redis;

  constructor(client?: Redis) {
    this.prefix = getEnvConfig().redis_key_prefix;
    this.client = client ?? getRedisClient();
  }

  private withPrefix(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(cache_key: string): Promise<T | null> {
    const fullKey = this.withPrefix(cache_key);
    await ensureRedisReady(this.client);
    const raw = await this.client.get(fullKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(
    cache_key: string,
    value: T,
    ttl_seconds = 60,
  ): Promise<void> {
    const fullKey = this.withPrefix(cache_key);
    await ensureRedisReady(this.client);
    const serialized = JSON.stringify(value);
    if (ttl_seconds > 0) {
      await this.client.set(fullKey, serialized, 'EX', ttl_seconds);
    } else {
      await this.client.set(fullKey, serialized);
    }
  }

  async del(cache_key: string): Promise<void> {
    const fullKey = this.withPrefix(cache_key);
    await ensureRedisReady(this.client);
    await this.client.del(fullKey);
  }

  async delByPrefix(prefix: string): Promise<void> {
    const fullPattern = this.withPrefix(`${prefix}*`);
    await ensureRedisReady(this.client);
    const stream = this.client.scanStream({
      match: fullPattern,
      count: 100,
    });

    const keysToDelete: string[] = [];
    for await (const resultKeys of stream) {
      if (Array.isArray(resultKeys) && resultKeys.length > 0) {
        keysToDelete.push(...(resultKeys as string[]));
      }
    }

    if (keysToDelete.length > 0) {
      await this.client.del(...keysToDelete);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await ensureRedisReady(this.client);
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }
}
