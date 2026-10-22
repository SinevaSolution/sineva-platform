import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toolGatewayRequestSchema } from '@/server/application/toolgateway/contracts';
const fixture = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, 'tool_gateway_fixtures', name), 'utf8'));
describe('platform-owned Tool Gateway contract fixtures', () => {
  it('validates the strict request fixture', () => {
    expect(toolGatewayRequestSchema.safeParse(fixture('request.json')).success).toBe(true);
  });
  it.each(['ok', 'approval_required', 'denied', 'error'])('provides an explicit %s outcome', (status) => {
    const response = fixture(`${status}.json`);
    expect(response.status).toBe(status);
    expect(Object.hasOwn(response, 'error_code')).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(/access_token|refresh_token|client_secret/);
  });
});
