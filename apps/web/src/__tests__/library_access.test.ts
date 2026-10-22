import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, ValidationError } from '@/server/domain/errors/domain_error';
import {
  canAccessScopes,
  computeRetrievalScope,
  documentAccessFor,
  principalsForScopes,
} from '@/server/domain/library/library_access';

const WS = '11111111-1111-4111-8111-111111111111';

function ctx(extra: Partial<RequestContext> = {}): RequestContext {
  return {
    user_id: 'u1',
    session_id: 's1',
    request_id: 'r1',
    workspace_id: WS,
    role: 'member',
    specialist_scope: 'all',
    ...extra,
  };
}

describe('retrieval scope is computed by the platform (FR-LIB-15)', () => {
  it('uses the workspace from the session and adds the executing specialist', () => {
    expect(computeRetrievalScope(ctx(), { agent_slug: 'sinohelp' })).toEqual({
      tenant_id: WS,
      principals: ['workspace', 'agent:sinohelp'],
    });
  });

  it('gives only the workspace principal for Sino itself or no specialist', () => {
    expect(computeRetrievalScope(ctx(), { agent_slug: 'sino' }).principals).toEqual(['workspace']);
    expect(computeRetrievalScope(ctx(), {}).principals).toEqual(['workspace']);
    expect(computeRetrievalScope(ctx(), { agent_slug: null }).principals).toEqual(['workspace']);
  });

  it('raises when the request has no workspace (a missing scope never means "everything")', () => {
    expect(() => computeRetrievalScope(ctx({ workspace_id: undefined }), {})).toThrow(ValidationError);
  });

  it('refuses a specialist the member may not use, also through Hub routing', () => {
    const restricted = ctx({ specialist_scope: 'selected', allowed_specialists: ['sinopeople'] });
    expect(() => computeRetrievalScope(restricted, { agent_slug: 'sinofinance' })).toThrow(ForbiddenError);
    expect(computeRetrievalScope(restricted, { agent_slug: 'sinopeople' }).principals).toEqual([
      'workspace',
      'agent:sinopeople',
    ]);
  });

  it('refuses an unknown specialist slug', () => {
    expect(() => computeRetrievalScope(ctx(), { agent_slug: 'sino-evil' })).toThrow(ValidationError);
    expect(() => computeRetrievalScope(ctx(), { agent_slug: '../x' })).toThrow(ValidationError);
  });
});

describe('document access by member specialist scope', () => {
  const workspaceDoc = [{ scope_type: 'workspace' as const, scope_ref: WS }];
  const helpDoc = [{ scope_type: 'specialist' as const, scope_ref: 'sinohelp' }];
  const squadDoc = [{ scope_type: 'squad' as const, scope_ref: 'sq1' }];
  const both = [...workspaceDoc, ...helpDoc];

  it('lets a member with all specialists see everything', () => {
    const access = documentAccessFor(ctx());
    expect(canAccessScopes(access, helpDoc)).toBe(true);
    expect(canAccessScopes(access, squadDoc)).toBe(true);
  });

  it('limits a member with selected specialists to workspace documents and their own specialists', () => {
    const access = documentAccessFor(ctx({ specialist_scope: 'selected', allowed_specialists: ['sinopeople'] }));
    expect(canAccessScopes(access, workspaceDoc)).toBe(true);
    expect(canAccessScopes(access, helpDoc)).toBe(false);
    expect(canAccessScopes(access, squadDoc)).toBe(false);
    expect(canAccessScopes(access, both)).toBe(true);
  });

  it('treats selected with an empty list as workspace documents only', () => {
    const access = documentAccessFor(ctx({ specialist_scope: 'selected', allowed_specialists: [] }));
    expect(canAccessScopes(access, helpDoc)).toBe(false);
    expect(canAccessScopes(access, workspaceDoc)).toBe(true);
  });
});

describe('acl principals written to sineva-ai', () => {
  it('maps scopes to principals and keeps a stable order without duplicates', () => {
    expect(
      principalsForScopes([
        { scope_type: 'specialist', scope_ref: 'sinohelp' },
        { scope_type: 'workspace', scope_ref: WS },
        { scope_type: 'specialist', scope_ref: 'sinohelp' },
        { scope_type: 'squad', scope_ref: 'sq1' },
      ]),
    ).toEqual(['agent:sinohelp', 'squad:sq1', 'workspace']);
  });
});
