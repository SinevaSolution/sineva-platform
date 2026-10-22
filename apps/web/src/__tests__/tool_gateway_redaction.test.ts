import { describe, expect, it } from 'vitest';
import { redactToolResult } from '@/server/infrastructure/gateway/redact_tool_result';
describe('Tool Gateway output redaction', () => {
  it('removes exact access and refresh tokens in nested results while preserving email content', () => {
    const value = {
      to: ['person@example.com'],
      body_text: 'Echo private-token and private-refresh',
      nested: { value: 'private-token' },
    };
    const result = redactToolResult(value, {
      access_token: 'private-token',
      refresh_token: 'private-refresh',
    });
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(JSON.stringify(result)).not.toContain('private-refresh');
    expect(result.to).toEqual(['person@example.com']);
  });
  it('uses the shared credential patterns even when a secret is not the resolved token', () => {
    const result = redactToolResult(
      { body_text: 'Authorization: Bearer secret_value_1234567890' },
      {},
    );
    expect(JSON.stringify(result)).not.toContain('secret_value_1234567890');
  });
  it('does not mutate the provider result', () => {
    const original = { body_text: 'private-token' };
    redactToolResult(original, { access_token: 'private-token' });
    expect(original.body_text).toBe('private-token');
  });
});
