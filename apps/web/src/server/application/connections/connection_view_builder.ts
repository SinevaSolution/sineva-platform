import type { ConnectionEntity } from '@/server/domain/connections/connection';
import { canManageConnection } from '@/server/domain/connections/connection_policy';
import type { ProviderManifest, ScopeDefinition } from '@/server/domain/connections/connector';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import { ForbiddenError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { ConnectionGrantEntity, ConnectionGrantRepository } from '@/server/domain/repositories/connection_grant_repository';
import type {
  AccessClassView,
  ConnectionView,
  GrantRowView,
  ProviderView,
  ScopeView,
} from '@/shared/connection_view';
import type { ConnectorRegistry } from './connector_registry';

/** Rotation reminder for pasted keys (FR-CONN-30). */
export const SECRET_ROTATION_DAYS = 90;

export interface Viewer {
  user_id: string;
  role: UserRole;
  workspace_id: string;
}

/** The member the request belongs to, or a refusal. The route guard already checked membership; this narrows the types. */
export function viewerOf(context: RequestContext): Viewer {
  if (!context.workspace_id || !context.role) throw new ForbiddenError('A workspace membership is required');
  return { user_id: context.user_id, role: context.role, workspace_id: context.workspace_id };
}

const CLASS_RANK: Record<AccessClassView, number> = { read: 0, write: 1, admin: 2 };

function scopeView(scope: ScopeDefinition): ScopeView {
  return { scope_key: scope.scope_key, label: scope.label, access_class: scope.access_class };
}

/**
 * Turns domain rows into the wire views of docs/api-spec/connections_endpoints.md.
 * It is the one place a connection leaves the server, so it is also the place
 * that guarantees what never does: the entity has no secret to copy, and the
 * view type has no field for one.
 */
export class ConnectionViewBuilder {
  constructor(
    private readonly deps: {
      registry: ConnectorRegistry;
      grants: ConnectionGrantRepository;
      /** Specialist slugs in roster order: one matrix row each. */
      specialistSlugs: readonly string[];
    },
  ) {}

  providerView(manifest: ProviderManifest, role: UserRole): ProviderView {
    const availability = this.deps.registry.availability(manifest.provider_id);
    return {
      provider_id: manifest.provider_id,
      display_name: manifest.display_name,
      category: manifest.category,
      status: manifest.status,
      available: availability.available,
      unavailable_reason: availability.reason,
      auth_type: manifest.auth_type,
      personal_capable: manifest.personal_capable,
      description: manifest.description,
      specialists: [...this.deps.registry.specialistsFor(manifest.provider_id)],
      scope_bundles: manifest.bundles.map((bundle) => {
        const scopes = this.deps.registry.bundleScopes(manifest.provider_id, bundle.bundle_key).map(scopeView);
        const highest = scopes.reduce<AccessClassView>((best, scope) => (CLASS_RANK[scope.access_class] > CLASS_RANK[best] ? scope.access_class : best), 'read');
        return { bundle_key: bundle.bundle_key, label: bundle.label, access_class: highest, scopes };
      }),
      credential_fields: (manifest.api_key?.fields ?? []).map((field) => ({
        field_key: field.field_key,
        label: field.label,
        kind: field.kind,
        ...(field.choices ? { choices: [...field.choices] } : {}),
      })),
      can_connect_workspace: availability.available && hasPermission(role, 'connection.connect_workspace').allowed,
      can_connect_personal:
        availability.available && manifest.personal_capable && hasPermission(role, 'connection.connect_personal').allowed,
    };
  }

  async connectionView(connection: ConnectionEntity, viewer: Viewer): Promise<ConnectionView> {
    const grants = await this.deps.grants.listByConnection(viewer.workspace_id, connection.id);
    return this.build(connection, grants, viewer);
  }

  /** One grants query for the whole list. */
  async connectionViews(connections: readonly ConnectionEntity[], viewer: Viewer): Promise<ConnectionView[]> {
    const grants = await this.deps.grants.listForConnections(
      viewer.workspace_id,
      connections.map((connection) => connection.id),
    );
    return connections.map((connection) =>
      this.build(connection, grants.filter((grant) => grant.connection_id === connection.id), viewer),
    );
  }

  /** The access matrix of a connection: one row per specialist, no row for a specialist that does not exist. */
  matrix(grants: readonly ConnectionGrantEntity[]): GrantRowView[] {
    return this.deps.specialistSlugs.map((agent_slug) => {
      const level = grants.find((grant) => grant.agent_slug === agent_slug)?.access_level;
      return { agent_slug, read: level !== undefined, write: level === 'write' };
    });
  }

  private build(connection: ConnectionEntity, grants: readonly ConnectionGrantEntity[], viewer: Viewer): ConnectionView {
    const providerId = connection.provider_id;
    // Only scopes the manifest knows get a label; a granted scope is always inside the chosen bundle, so none is dropped.
    const known = (keys: readonly string[]): ScopeView[] =>
      keys.flatMap((key) => {
        const scope = this.deps.registry.scope(providerId, key);
        return scope ? [scopeView(scope)] : [];
      });
    const revoked = connection.status === 'revoked';
    const manage = !revoked && canManageConnection(viewer.role, viewer.user_id, connection) && hasPermission(viewer.role, 'connection.disconnect').allowed;
    const rotationBase = connection.auth_type === 'api_key' ? (connection.secret_rotated_at ?? connection.created_at) : null;

    return {
      id: connection.id,
      provider_id: providerId,
      owner_scope: connection.owner_scope,
      is_mine: connection.owner_scope === 'user' && connection.owner_user_id === viewer.user_id,
      status: connection.status,
      auth_type: connection.auth_type,
      account_label: connection.account_label,
      scope_bundle: connection.scope_bundle,
      granted_scopes: known(connection.granted_scopes),
      missing_scopes:
        connection.status === 'partial'
          ? known(connection.requested_scopes.filter((scope) => !connection.granted_scopes.includes(scope)))
          : [],
      last_health_at: connection.last_health_at?.toISOString() ?? null,
      last_error_code: connection.last_error_code,
      secret_rotation_due_at:
        rotationBase && !revoked ? new Date(rotationBase.getTime() + SECRET_ROTATION_DAYS * 86_400_000).toISOString() : null,
      created_at: connection.created_at.toISOString(),
      updated_at: connection.updated_at.toISOString(),
      revoked_at: connection.revoked_at?.toISOString() ?? null,
      grants: this.matrix(grants),
      can: {
        grant: !revoked && hasPermission(viewer.role, 'connection.grant').allowed,
        disconnect: manage,
        reconnect: manage && connection.auth_type === 'oauth2_pkce',
        test: manage,
        view_activity: !revoked && hasPermission(viewer.role, 'connection.view_activity').allowed,
      },
    };
  }
}
