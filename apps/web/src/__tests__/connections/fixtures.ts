import type {
  ConnectionCan,
  ConnectionView,
  GrantView,
  ProviderView,
  ScopeView,
} from '@/shared/connections_view';
import type { ConnectionsRole } from '@/client/components/connections/connections_model';

export const readScope: ScopeView = {
  key: 'https://scopes.example/read',
  label_en: 'Read invoices and contacts',
  label_id: 'Membaca faktur dan kontak',
  access_class: 'read',
};

export const writeScope: ScopeView = {
  key: 'https://scopes.example/write',
  label_en: 'Create draft invoices',
  label_id: 'Membuat draf faktur',
  access_class: 'write',
};

/** An admin's view of a sign-in provider with a read tier and a write tier. */
export function provider(patch: Partial<ProviderView> = {}): ProviderView {
  return {
    slug: 'mekari_jurnal',
    name: 'Mekari Jurnal',
    short_name: 'Jurnal',
    category: 'accounting',
    auth_type: 'oauth',
    availability: 'available',
    description_en: null,
    description_id: null,
    can_connect_workspace: true,
    can_connect_personal: false,
    credential_fields: [],
    read_only_notice: false,
    write_supported: true,
    bundles: [
      { key: 'read', access_class: 'read', scopes: [readScope] },
      { key: 'read_write', access_class: 'write', scopes: [readScope, writeScope] },
    ],
    specialists: ['sinofinance', 'sinoinsights'],
    ...patch,
  };
}

/** What the server says each role may do with a workspace connection (api-spec "Permissions"). */
export function canFor(role: ConnectionsRole, own = false): ConnectionCan {
  const manager = role === 'owner' || role === 'admin';
  if (manager) return { grant: true, disconnect: true, reconnect: true, test: true, view_activity: true };
  if (role === 'member')
    return { grant: false, disconnect: own, reconnect: own, test: true, view_activity: false };
  return { grant: false, disconnect: false, reconnect: false, test: false, view_activity: false };
}

export function connection(patch: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    provider_slug: 'mekari_jurnal',
    provider_name: 'Mekari Jurnal',
    provider_short_name: 'Jurnal',
    owner_scope: 'workspace',
    owned_by_me: false,
    status: 'connected',
    account_label: 'budi@kopisenja.id',
    connected_by_name: null,
    connected_at: '2026-10-12T08:00:00Z',
    last_health_at: '2026-10-21T08:14:00Z',
    last_error_code: null,
    granted_scopes: [readScope],
    missing_scopes: [],
    grants: [
      { agent_slug: 'sinofinance', access_level: 'read' },
      { agent_slug: 'sinoinsights', access_level: 'read' },
    ],
    secret_rotation_due_at: null,
    revoked_at: null,
    can: canFor('admin'),
    ...patch,
  };
}

export const grants = (...pairs: Array<[string, GrantView['access_level']]>): GrantView[] =>
  pairs.map(([agent_slug, access_level]) => ({ agent_slug, access_level }));
