import { describe, expect, it, vi } from 'vitest';
import { RedisToolCallLimiter } from '@/server/infrastructure/ratelimit/redis_tool_call_limiter';
import type Redis from 'ioredis';
describe('Tool call rate limiter', () => {
  it('uses two tenant-bound keys for the connection and workspace', async () => {
    const evalFn = vi.fn(async () => 1);
    const limiter = new RedisToolCallLimiter(
      { status: 'ready', eval: evalFn } as unknown as Redis,
      'test:',
    );
    expect(await limiter.take('workspace1', 'connection1', 'gmail')).toBe(true);
    const args = evalFn.mock.calls[0] as unknown as unknown[];
    expect(args[1]).toBe(2);
    expect(args[2]).toBe('test:{workspace1}:tools:connection:connection1');
    expect(args[3]).toBe('test:{workspace1}:tools:workspace');
  });
  it('returns false at the limit', async () => {
    const limiter = new RedisToolCallLimiter(
      { status: 'ready', eval: async () => 0 } as unknown as Redis,
      'test:',
    );
    expect(await limiter.take('w', 'c', 'gmail')).toBe(false);
  });
  it('fails closed when Redis is unavailable', async () => {
    const limiter = new RedisToolCallLimiter(
      {
        status: 'ready',
        eval: async () => {
          throw new Error('down');
        },
      } as unknown as Redis,
      'test:',
    );
    await expect(limiter.take('w', 'c', 'gmail')).rejects.toMatchObject({
      code: 'dependency_unavailable',
      status: 503,
    });
  });
});
