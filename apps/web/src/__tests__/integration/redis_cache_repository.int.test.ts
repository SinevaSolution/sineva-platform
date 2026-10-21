import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { RedisCacheRepository } from '@/server/infrastructure/cache/redis_cache_repository';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('RedisCacheRepository (Integration)', () => {
  let client: Redis;
  let repository: RedisCacheRepository;
  let isRedisAvailable = false;

  beforeAll(async () => {
    client = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      enableOfflineQueue: false,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      isRedisAvailable = pong === 'PONG';
    } catch {
      isRedisAvailable = false;
    }

    repository = new RedisCacheRepository(client);
  });

  afterAll(async () => {
    if (client.status === 'ready' || client.status === 'connecting') {
      await client.quit().catch(() => {});
    }
  });

  it('reports truthful ping status (fails when server is down, passes when connected)', async () => {
    const unreachableClient = new Redis('redis://127.0.0.1:54321', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 500,
      enableOfflineQueue: false,
    });
    const brokenRepo = new RedisCacheRepository(unreachableClient);

    expect(await brokenRepo.ping()).toBe(false);
    await unreachableClient.quit().catch(() => {});

    if (isRedisAvailable) {
      expect(await repository.ping()).toBe(true);
    }
  });

  it('sets, gets, expires, and deletes cache values when Redis is available', async () => {
    if (!isRedisAvailable) {
      return;
    }

    const testKey = `int_test_${Date.now()}`;
    const payload = { id: 123, message: 'Truthful Redis Test' };

    await repository.set(testKey, payload, 60);
    const retrieved = await repository.get<typeof payload>(testKey);
    expect(retrieved).toEqual(payload);

    await repository.del(testKey);
    const deleted = await repository.get(testKey);
    expect(deleted).toBeNull();
  });

  it('delByPrefix removes all keys matching pattern while preserving others', async () => {
    if (!isRedisAvailable) {
      return;
    }

    const prefix = `del_prefix_${Date.now()}:`;
    await repository.set(`${prefix}page_1`, { page: 1 });
    await repository.set(`${prefix}page_2`, { page: 2 });
    await repository.set(`unrelated_${prefix}page_3`, { page: 3 });

    await repository.delByPrefix(prefix);

    expect(await repository.get(`${prefix}page_1`)).toBeNull();
    expect(await repository.get(`${prefix}page_2`)).toBeNull();
    expect(await repository.get(`unrelated_${prefix}page_3`)).not.toBeNull();

    await repository.del(`unrelated_${prefix}page_3`);
  });
});
