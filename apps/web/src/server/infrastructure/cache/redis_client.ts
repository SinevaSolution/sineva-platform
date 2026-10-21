import 'server-only';
import Redis from 'ioredis';
import { getEnvConfig } from '../config/env';

let redisClientInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClientInstance) {
    const env = getEnvConfig();
    redisClientInstance = new Redis(env.redis_url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      // Commands fail fast instead of piling up while Redis is down. The cost
      // is that a lazy client must be connected explicitly before the first
      // command: see `ensureRedisReady`.
      enableOfflineQueue: false,
    });
  }
  return redisClientInstance;
}

// One in-flight connect per client. ioredis throws "already connecting" if
// `connect()` is called twice, so concurrent first requests share a promise.
const pendingConnects = new WeakMap<Redis, Promise<void>>();

/**
 * Opens a lazy client before its first command. Needed because
 * `enableOfflineQueue: false` rejects commands sent while the socket is still
 * in the `wait` state ("Stream isn't writeable").
 */
export async function ensureRedisReady(client: Redis): Promise<void> {
  if (client.status === 'ready') {
    return;
  }
  if (client.status === 'wait' || client.status === 'end') {
    let pending = pendingConnects.get(client);
    if (!pending) {
      pending = client.connect().finally(() => pendingConnects.delete(client));
      pendingConnects.set(client, pending);
    }
    await pending;
    return;
  }
  // `connect`, `connecting` or `reconnecting`: the connect was started by us
  // or by ioredis itself (a command on a lazy client triggers it). Wait for
  // `ready` instead of calling `connect()` again, which would throw.
  const pending = pendingConnects.get(client);
  if (pending) {
    await pending;
    return;
  }
  if (CONNECTING_STATES.has(client.status)) {
    await waitForReady(client, READY_TIMEOUT_MS);
  }
  // Any other status (`close`, or a test double without one): send the
  // command and let ioredis report the real error.
}

const CONNECTING_STATES = new Set(['connect', 'connecting', 'reconnecting']);

const READY_TIMEOUT_MS = 2000;

function waitForReady(client: Redis, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      client.off('ready', onReady);
      client.off('error', onError);
      client.off('end', onEnd);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('Redis connection closed before it was ready'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Redis was not ready within ${timeoutMs} ms`));
    }, timeoutMs);
    client.once('ready', onReady);
    client.once('error', onError);
    client.once('end', onEnd);
  });
}
