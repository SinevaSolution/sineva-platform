import 'server-only';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';
import { ensureRedisReady } from '../cache/redis_client';

// Initial safety limits, to tune from observed traffic (WP-M2-07).
export const TOOL_CALL_LIMITS = { window_ms: 60_000, per_connection: 30, per_workspace: 120 };
const SLIDING_WINDOW = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local window = tonumber(ARGV[1])
for i = 1, 2 do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  if redis.call('ZCARD', KEYS[i]) >= tonumber(ARGV[i + 1]) then return 0 end
end
for i = 1, 2 do
  redis.call('ZADD', KEYS[i], now, ARGV[4])
  redis.call('PEXPIRE', KEYS[i], window)
end
return 1
`;

export class RedisToolCallLimiter {
  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
    private readonly limits = TOOL_CALL_LIMITS,
  ) {}
  async take(workspaceId: string, connectionId: string, _providerId: string): Promise<boolean> {
    void _providerId;
    try {
      await ensureRedisReady(this.client);
      const root = `${this.prefix}{${workspaceId}}:tools:`;
      const result = await this.client.eval(
        SLIDING_WINDOW,
        2,
        `${root}connection:${connectionId}`,
        `${root}workspace`,
        this.limits.window_ms,
        this.limits.per_connection,
        this.limits.per_workspace,
        randomUUID(),
      );
      return result === 1;
    } catch {
      throw new ToolGatewayError('dependency_unavailable', 503);
    }
  }
}
