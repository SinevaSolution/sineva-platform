import { describe, expect, it } from 'vitest';
import {
  buildAuditRecord,
  redactAuditValue,
  truncateIp,
} from '@/server/domain/audit/audit_event';
import type { AuditEventRepository } from '@/server/domain/repositories/audit_event_repository';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import type { RequestContext } from '@/server/domain/context/request_context';
import { FakeAuditEventRepository } from './fakes/fake_audit_event_repository';

const WS = '11111111-1111-4111-8111-111111111111';

function userContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    user_id: 'usr-1',
    workspace_id: WS,
    session_id: 'sess-1',
    request_id: 'req-1',
    actor: { type: 'user', id: 'usr-1' },
    ...overrides,
  };
}

describe('buildAuditRecord: FR-SEC-32 field set', () => {
  it('stores every FR-SEC-32 field for a user action', () => {
    const record = buildAuditRecord({
      action: 'workspace.updated',
      context: userContext({ ip: '203.0.113.77', user_agent: 'UnitTest/1.0' }),
      target_resource_type: 'workspace',
      target_resource_id: WS,
      run_id: 'run-9',
      metadata: { changed_fields: ['workspace_name'] },
      change: { before: { workspace_name: 'Old' }, after: { workspace_name: 'New' } },
    });

    expect(record).toMatchObject({
      workspace_id: WS,
      actor_type: 'user',
      actor_id: 'usr-1',
      on_behalf_of_user_id: null,
      action: 'workspace.updated',
      target_type: 'workspace',
      target_id: WS,
      outcome: 'allowed',
      reason_code: null,
      request_id: 'req-1',
      run_id: 'run-9',
      ip: '203.0.113.0',
      user_agent: 'UnitTest/1.0',
      metadata: { changed_fields: ['workspace_name'] },
    });
    expect(record.change).toEqual({
      before: { workspace_name: 'Old' },
      after: { workspace_name: 'New' },
    });
    // The hash chain is WP-M2-08; v0 rows carry the columns but no values.
    expect(record).not.toHaveProperty('hash');
    expect(record).not.toHaveProperty('prev_hash');
  });

  it('records denied outcomes with a reason code and an explicit workspace override', () => {
    const record = buildAuditRecord({
      action: 'session.access_denied',
      context: userContext({ workspace_id: undefined }),
      workspace_id: WS,
      outcome: 'denied',
      reason_code: 'ownership_mismatch',
    });

    expect(record.workspace_id).toBe(WS);
    expect(record.outcome).toBe('denied');
    expect(record.reason_code).toBe('ownership_mismatch');
  });

  it('attributes events built from an anonymous context with a real user id to that user', () => {
    // Use cases build `{ ...createAnonymousRequestContext(...), user_id }`,
    // which keeps the anonymous system actor. The row must name the user.
    const record = buildAuditRecord({
      action: 'user.signed_in',
      context: {
        user_id: 'usr-7',
        session_id: 'sess-7',
        request_id: 'auth-signin',
        actor: { type: 'system', id: 'anonymous' },
      },
    });

    expect(record.actor_type).toBe('user');
    expect(record.actor_id).toBe('usr-7');
    expect(record.workspace_id).toBeNull();
  });

  it('keeps system and internal actors as system', () => {
    const record = buildAuditRecord({
      action: 'context.verification_failed',
      context: {
        user_id: 'system:internal',
        session_id: 'internal',
        request_id: 'req-2',
        actor: { type: 'system', id: 'internal' },
      },
    });

    expect(record.actor_type).toBe('system');
    expect(record.actor_id).toBe('internal');
  });

  it('records the acting user as on_behalf_of for a specialist actor', () => {
    const record = buildAuditRecord({
      action: 'tool.called',
      context: userContext(),
      actor: { type: 'specialist', id: 'sinosales' },
      on_behalf_of_user_id: 'usr-1',
    });

    expect(record.actor_type).toBe('specialist');
    expect(record.actor_id).toBe('sinosales');
    expect(record.on_behalf_of_user_id).toBe('usr-1');
  });
});

describe('buildAuditRecord: content is referenced by id, never copied', () => {
  it('redacts secrets, content and personal data in `change` and `metadata`', () => {
    const record = buildAuditRecord({
      action: 'user.profile_updated',
      context: userContext(),
      change: {
        before: { full_name: 'Amira Putri', locale: 'id', password: 'hunter2' },
        after: { full_name: 'Amira Lestari', locale: 'en', access_token: 'abc.def.ghi' },
      },
      metadata: {
        message_count: 3,
        content: 'the customer said something private',
        prompt: 'system prompt text',
        emailHash: 'a'.repeat(64),
        nested: { api_key: 'sk-live-123', kept: 'ok' },
      },
    });

    expect(record.change).toEqual({
      before: { full_name: '[redacted]', locale: 'id', password: '[redacted]' },
      after: { full_name: '[redacted]', locale: 'en', access_token: '[redacted]' },
    });
    expect(record.metadata).toEqual({
      message_count: 3,
      content: '[redacted]',
      prompt: '[redacted]',
      emailHash: 'a'.repeat(64),
      nested: { api_key: '[redacted]', kept: 'ok' },
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('abc.def.ghi');
    expect(serialized).not.toContain('customer said');
  });

  it('bounds long strings, deep objects and long arrays', () => {
    const redacted = redactAuditValue({
      long: 'x'.repeat(5000),
      list: Array.from({ length: 100 }, (_, i) => i),
      a: { b: { c: { d: { e: { f: 'too deep' } } } } },
    }) as Record<string, unknown>;

    expect((redacted.long as string).length).toBeLessThanOrEqual(260);
    expect((redacted.list as unknown[]).length).toBeLessThanOrEqual(21);
    expect(JSON.stringify(redacted)).not.toContain('too deep');
  });
});

describe('truncateIp: only a network prefix is stored', () => {
  it.each([
    ['203.0.113.77', '203.0.113.0'],
    ['::ffff:198.51.100.23', '198.51.100.0'],
    ['2001:db8:abcd:12:34:56:78:9a', '2001:db8:abcd::'],
    ['2001:db8::1', '2001:db8::'],
    ['::1', '::'],
  ])('%s -> %s', (input, expected) => {
    expect(truncateIp(input)).toBe(expected);
  });

  it('drops values that are not an IP address', () => {
    expect(truncateIp('not-an-ip')).toBeNull();
    expect(truncateIp('')).toBeNull();
    expect(truncateIp(undefined)).toBeNull();
  });
});

describe('audit repository is append-only (FR-SEC-31)', () => {
  const ALLOWED = ['insert', 'select'];

  function methodsOf(ctor: { prototype: object }): string[] {
    return Object.getOwnPropertyNames(ctor.prototype).filter((name) => name !== 'constructor');
  }

  it('the Prisma adapter exposes insert and select only', () => {
    expect(methodsOf(PrismaAuditRepository).sort()).toEqual(ALLOWED);
  });

  it('the test fake exposes insert and select only', () => {
    expect(methodsOf(FakeAuditEventRepository).sort()).toEqual(ALLOWED);
  });

  it('the port has no update or delete member (compile-time check)', () => {
    type Forbidden = 'update' | 'delete' | 'remove' | 'upsert' | 'deleteMany' | 'updateMany';
    type Leaks = Extract<keyof AuditEventRepository, Forbidden>;
    const noLeak: Leaks extends never ? true : false = true;
    expect(noLeak).toBe(true);
  });
});
