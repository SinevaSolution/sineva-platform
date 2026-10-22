import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { RedisCacheRepository } from '@/server/infrastructure/cache/redis_cache_repository';

// The shared client is created with `lazyConnect: true` and
// `enableOfflineQueue: false`. In that mode ioredis rejects any command sent
// before the socket is open ("Stream isn't writeable"), so the repository must
// open the connection itself on first use. This fake mimics that contract.
function fakeLazyClient() {
  const store = new Map<string, string>();
  const client = Object.assign(new EventEmitter(), {
    status: 'wait' as string,
    connect: vi.fn(async () => {
      if (client.status !== 'wait') {
        throw new Error('Redis is already connecting/connected');
      }
      client.status = 'connecting';
      await Promise.resolve();
      client.status = 'ready';
      client.emit('ready');
    }),
    get: vi.fn(async (key: string) => {
      if (client.status !== 'ready') {
        throw new Error(
          "Stream isn't writeable and enableOfflineQueue options is false",
        );
      }
      return store.get(key) ?? null;
    }),
    set: vi.fn(async (key: string, value: string) => {
      if (client.status !== 'ready') {
        throw new Error(
          "Stream isn't writeable and enableOfflineQueue options is false",
        );
      }
      store.set(key, value);
      return 'OK';
    }),
  });
  return client;
}

describe('RedisCacheRepository with a lazy, offline-queue-free client', () => {
  it('connects on first use instead of failing with an unwritable stream', async () => {
    const client = fakeLazyClient();
    const repo = new RedisCacheRepository(client as unknown as Redis);

    await expect(repo.get('agents:page:1')).resolves.toBeNull();
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('connects once when several commands race on a cold client', async () => {
    const client = fakeLazyClient();
    const repo = new RedisCacheRepository(client as unknown as Redis);

    await Promise.all([
      repo.set('a', { n: 1 }),
      repo.get('a'),
      repo.get('b'),
    ]);
    expect(client.connect).toHaveBeenCalledTimes(1);
    await expect(repo.get('a')).resolves.toEqual({ n: 1 });
  });

  it('waits for a connect that ioredis started on its own', async () => {
    const client = fakeLazyClient();
    // A command on a lazy ioredis client starts the connect internally, so
    // the status is already `connecting` without our promise existing.
    client.status = 'connecting';
    const repo = new RedisCacheRepository(client as unknown as Redis);

    const pending = repo.get('agents:page:1');
    setTimeout(() => {
      client.status = 'ready';
      client.emit('ready');
    }, 5);

    await expect(pending).resolves.toBeNull();
    expect(client.connect).not.toHaveBeenCalled();
  });
});
