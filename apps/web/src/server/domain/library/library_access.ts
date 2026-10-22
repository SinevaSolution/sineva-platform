import type { RequestContext } from '@/server/domain/context/request_context';
import { CANONICAL_SPECIALIST_SLUGS } from '@/server/domain/chat/specialist_catalog';
import { ForbiddenError, ValidationError } from '@/server/domain/errors/domain_error';

// Who may read which document, and which principals a retrieval carries. The
// retrieval scope is built here from the session, never from a request body,
// a query string or a model argument (FR-LIB-15, security non-negotiable 1).

/** The orchestrator reads workspace documents only: it has no scope of its own. */
const ORCHESTRATOR_SLUG = 'sino';

export interface RetrievalScope {
  tenant_id: string;
  /** `workspace`, `agent:<slug>`; `squad:<id>` joins in M4. Also the `acl` strings sineva-ai stores. */
  principals: string[];
}

export interface ScopeRef {
  scope_type: 'workspace' | 'specialist' | 'squad' | 'workflow';
  scope_ref: string;
}

/** What the caller may see in the Library, derived from the member's specialist scope. */
export type DocumentAccess = { all: true } | { all: false; specialists: string[] };

function memberMaySeeSpecialist(context: RequestContext, slug: string): boolean {
  return context.specialist_scope !== 'selected' || (context.allowed_specialists ?? []).includes(slug);
}

export function computeRetrievalScope(
  context: RequestContext,
  input: { agent_slug?: string | null },
): RetrievalScope {
  if (!context.workspace_id) {
    // A missing scope must raise: an empty filter would mean "everything".
    throw new ValidationError('Workspace context is required', [
      { code: 'required', field: 'workspace_id', detail: 'Workspace context is required' },
    ]);
  }
  const principals = ['workspace'];
  const slug = input.agent_slug?.toLowerCase().trim();
  if (slug && slug !== ORCHESTRATOR_SLUG) {
    if (!CANONICAL_SPECIALIST_SLUGS.has(slug)) {
      throw new ValidationError('Unknown specialist', [
        { code: 'unknown_specialist', field: 'agent_slug', detail: 'agent_slug is not a known specialist' },
      ]);
    }
    // Hub routing must not become a way around a member's specialist limits.
    if (!memberMaySeeSpecialist(context, slug)) {
      throw new ForbiddenError(`Access to specialist '${slug}' is restricted for this member`);
    }
    principals.push(`agent:${slug}`);
  }
  return { tenant_id: context.workspace_id, principals };
}

export function documentAccessFor(context: RequestContext): DocumentAccess {
  if (context.specialist_scope === 'selected') {
    return { all: false, specialists: [...(context.allowed_specialists ?? [])] };
  }
  return { all: true };
}

/** A document is visible when any of its scopes is. Squad scopes need squad membership (M4), so a restricted member never sees them. */
export function canAccessScopes(access: DocumentAccess, scopes: ScopeRef[]): boolean {
  if (access.all) {
    return true;
  }
  return scopes.some(
    (scope) =>
      scope.scope_type === 'workspace' ||
      (scope.scope_type === 'specialist' && access.specialists.includes(scope.scope_ref)),
  );
}

/** Whether a companion (null for Sino in a team chat) may use a document with these scopes. */
export function usableBy(scopes: ScopeRef[], slug: string | null): boolean {
  return scopes.some(
    (scope) => scope.scope_type === 'workspace' || (slug !== null && scope.scope_type === 'specialist' && scope.scope_ref === slug),
  );
}

export function principalsForScopes(scopes: ScopeRef[]): string[] {
  const principals = scopes.map((scope) => {
    switch (scope.scope_type) {
      case 'workspace':
        return 'workspace';
      case 'specialist':
        return `agent:${scope.scope_ref}`;
      case 'squad':
        return `squad:${scope.scope_ref}`;
      case 'workflow':
        return `workflow:${scope.scope_ref}`;
    }
  });
  return [...new Set(principals)].sort();
}
