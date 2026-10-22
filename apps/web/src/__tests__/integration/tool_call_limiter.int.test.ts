import { afterAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { RedisToolCallLimiter } from '@/server/infrastructure/ratelimit/redis_tool_call_limiter';
const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});
afterAll(async () => {
  if (client.status !== 'end') await client.quit();
});
describe('shared sliding-window tool limits with Redis', () => {
  it('admits only the configured number across concurrent instances', async () => {
    const prefix = `gateway-test-${Date.now()}:`;
    const a = new RedisToolCallLimiter(client, prefix, {
      window_ms: 60000,
      per_connection: 3,
      per_workspace: 10,
    });
    const b = new RedisToolCallLimiter(client, prefix, {
      window_ms: 60000,
      per_connection: 3,
      per_workspace: 10,
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, n) =>
        (n % 2 ? a : b).take('workspace-a', 'connection-a', 'gmail'),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    const otherTenant = await b.take('workspace-b', 'connection-a', 'gmail');
    expect(otherTenant).toBe(true);
    const keys = await client.keys(`${prefix}*`);
    if (keys.length) await client.del(...keys);
  });
  it('enforces the workspace limit across separate connections', async () => {
    const prefix = `gateway-test-workspace-${Date.now()}:`;
    const limiter = new RedisToolCallLimiter(client, prefix, {
      window_ms: 60000,
      per_connection: 10,
      per_workspace: 2,
    });
    expect(await limiter.take('w', 'a', 'gmail')).toBe(true);
    expect(await limiter.take('w', 'b', 'gmail')).toBe(true);
    expect(await limiter.take('w', 'c', 'gmail')).toBe(false);
    const keys = await client.keys(`${prefix}*`);
    if (keys.length) await client.del(...keys);
  });
});
