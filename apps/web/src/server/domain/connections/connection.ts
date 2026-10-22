// Connections (ADR-0037, ADR-0039). A connection is the workspace's link to one
// provider account; its secrets live in the vault and are never part of this
// entity.

import { DomainError } from '@/server/domain/errors/domain_error';

export type ConnectionStatus = 'connected' | 'partial' | 'needs_reconnect' | 'error' | 'revoked';
export const CONNECTION_STATUSES: readonly ConnectionStatus[] = [
  'connected',
  'partial',
  'needs_reconnect',
  'error',
  'revoked',
];

/** Statuses a credential may be resolved for. Everything else fails typed before the vault is touched. */
export const USABLE_CONNECTION_STATUSES: readonly ConnectionStatus[] = ['connected', 'partial'];

export type OwnerScope = 'workspace' | 'user';
export type ConnectorAuthType = 'oauth2_pkce' | 'api_key' | 'hmac' | 'embedded_signup';

export interface ConnectionEntity {
  id: string;
  workspace_id: string;
  provider_id: string;
  owner_scope: OwnerScope;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  auth_type: ConnectorAuthType;
  status: ConnectionStatus;
  scope_bundle: string | null;
  requested_scopes: string[];
  granted_scopes: string[];
  external_account_id: string | null;
  account_label: string | null;
  access_expires_at: Date | null;
  refresh_expires_at: Date | null;
  last_refreshed_at: Date | null;
  last_health_at: Date | null;
  last_error_code: string | null;
  secret_rotated_at: Date | null;
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NewConnection {
  workspace_id: string;
  provider_id: string;
  owner_scope: OwnerScope;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  auth_type: ConnectorAuthType;
  status: ConnectionStatus;
  scope_bundle: string | null;
  requested_scopes: string[];
  granted_scopes: string[];
  external_account_id: string | null;
  account_label: string | null;
  access_expires_at: Date | null;
  refresh_expires_at: Date | null;
  secret_rotated_at?: Date | null;
}

export type ConnectionPatch = Partial<
  Pick<
    ConnectionEntity,
    | 'status'
    | 'scope_bundle'
    | 'requested_scopes'
    | 'granted_scopes'
    | 'external_account_id'
    | 'account_label'
    | 'access_expires_at'
    | 'refresh_expires_at'
    | 'last_refreshed_at'
    | 'last_health_at'
    | 'last_error_code'
    | 'secret_rotated_at'
  >
>;

/** Visible to `viewer` means: workspace-owned, or personal and owned by the viewer. */
export function isVisibleTo(connection: Pick<ConnectionEntity, 'owner_scope' | 'owner_user_id'>, viewerUserId: string): boolean {
  return connection.owner_scope === 'workspace' || connection.owner_user_id === viewerUserId;
}

/** The connection exists but cannot be used right now. The code is what callers and the UI act on. */
export class ConnectionUnusableError extends DomainError {
  constructor(
    code: 'connection_needs_reconnect' | 'connection_revoked' | 'connection_unavailable',
    readonly connection_id: string,
  ) {
    super({
      message: 'This connection cannot be used right now',
      code,
      status: 409,
      details: [{ code, field: 'connection_id', detail: connection_id }],
    });
    this.name = 'ConnectionUnusableError';
  }
}
