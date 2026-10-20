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
    });
  }
  return redisClientInstance;
}
