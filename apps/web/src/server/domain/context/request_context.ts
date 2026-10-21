import type { UserRole } from '@/server/domain/entities/user';

export type StaffRole = 'operator' | 'platform_admin' | 'support';

export interface ActorContext {
  type: 'user' | 'mcp_client' | 'system';
  id: string;
}

export interface RequestContext {
  user_id: string;
  workspace_id?: string;
  role?: UserRole;
  specialist_scope?: 'all' | 'selected';
  allowed_specialists?: string[];
  session_id: string;
  request_id: string;
  staff_role?: StaffRole | null;
  actor?: ActorContext;
}

export function createAnonymousRequestContext(requestId: string): RequestContext {
  return {
    user_id: 'anonymous',
    session_id: 'none',
    request_id: requestId,
    actor: {
      type: 'system',
      id: 'anonymous',
    },
  };
}
