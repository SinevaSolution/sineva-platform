import {
  ConnectionViewBuilder,
} from '@/server/application/connections/connection_view_builder';
import {
  GetConnectionUseCase,
  ListConnectionActivityUseCase,
  ListConnectionsUseCase,
  ListProvidersUseCase,
} from '@/server/application/connections/connection_queries';
import { ReconnectConnectionUseCase, TestConnectionUseCase } from '@/server/application/connections/connection_actions';
import {
  ConnectionRevoker,
  DisconnectConnectionUseCase,
  MassRevokeConnectionsUseCase,
} from '@/server/application/connections/disconnect_connection_use_case';
import { ConnectionHealthService } from '@/server/application/connections/refresh/connection_health_service';
import { SaveApiKeyConnectionUseCase } from '@/server/application/connections/save_api_key_connection_use_case';
import { UpdateConnectionGrantsUseCase } from '@/server/application/connections/update_connection_grants_use_case';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import {
  ConnectorUnreachableError,
  type ConnectorDriver,
  type ConnectorHttpClient,
  type ConnectorHttpRequest,
  type ConnectorHttpResponse,
} from '@/server/domain/connections/connector';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import { ApiKeyDriver } from '@/server/infrastructure/connectors/api_key_driver';
import { SPECIALIST_MANIFEST } from '@/shared/specialists/manifest';
import { allowAllEntitlements } from '../fakes/allow_all_entitlements';
import { buildRefreshWorld, type RefreshWorld } from './refresh_world';

/** A payment host for tests: knows which keys it accepts, answers like Xendit and Midtrans do. */
export class FakeKeyHost implements ConnectorHttpClient {
  readonly requests: ConnectorHttpRequest[] = [];
  accepted = new Set<string>();
  /** Keys that are valid but not allowed to do this (403). */
  restricted = new Set<string>();
  private failures = 0;

  failNext(count = 1): void {
    this.failures += count;
  }

  async request(request: ConnectorHttpRequest): Promise<ConnectorHttpResponse> {
    this.requests.push(request);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new ConnectorUnreachableError(null);
    }
    const header = request.headers?.Authorization ?? '';
    const key = Buffer.from(header.replace(/^Basic /, ''), 'base64').toString().replace(/:$/, '');
    if (this.restricted.has(key)) return { status: 403, body: '' };
    if (!this.accepted.has(key)) return { status: 401, body: '' };
    // Midtrans answers 404 for the reserved order id when the key is accepted; Xendit answers 200.
    return { status: request.url.includes('midtrans.com') ? 404 : 200, body: '{}' };
  }
}

export interface ApiWorld extends RefreshWorld {
  keyHost: FakeKeyHost;
  builder: ConnectionViewBuilder;
  specialistSlugs: readonly string[];
  listProviders: ListProvidersUseCase;
  listConnections: ListConnectionsUseCase;
  getConnection: GetConnectionUseCase;
  saveKey: SaveApiKeyConnectionUseCase;
  updateGrants: UpdateConnectionGrantsUseCase;
  disconnect: DisconnectConnectionUseCase;
  massRevoke: MassRevokeConnectionsUseCase;
  testConnection: TestConnectionUseCase;
  reconnectConnection: ReconnectConnectionUseCase;
  activity: ListConnectionActivityUseCase;
  revoker: ConnectionRevoker;
}

export function buildApiWorld(options: Parameters<typeof buildRefreshWorld>[0] = {}): ApiWorld {
  const world = buildRefreshWorld(options);
  const keyHost = new FakeKeyHost();
  const specialistSlugs = SPECIALIST_MANIFEST.map((entry) => entry.agent_slug);
  const manifest = (id: string) => PROVIDER_MANIFESTS.find((m) => m.provider_id === id)!;
  const drivers: ConnectorDriverResolver = {
    driverFor(providerId: string): ConnectorDriver {
      if (manifest(providerId).auth_type === 'api_key') return new ApiKeyDriver(manifest(providerId), keyHost);
      return world.drivers.driverFor(providerId);
    },
  };
  const now = () => world.clock.now;
  // The probe must see the API-key driver too, so it is rebuilt on the combined resolver.
  const health = new ConnectionHealthService({
    connections: world.connections,
    resolver: world.resolver,
    drivers,
    refresh: world.refresh,
    state: world.state,
    log: world.log,
    now,
  });
  const builder = new ConnectionViewBuilder({ registry: world.registry, grants: world.grants, specialistSlugs });
  const revoker = new ConnectionRevoker({
    connections: world.connections,
    grants: world.grants,
    resolver: world.resolver,
    secrets: world.vault,
    drivers,
    audit: world.auditLogger,
    transactions: world.transactions,
    log: world.log,
    now,
  });

  return {
    ...world,
    drivers,
    health,
    keyHost,
    builder,
    specialistSlugs,
    revoker,
    listProviders: new ListProvidersUseCase({ registry: world.registry, builder }),
    listConnections: new ListConnectionsUseCase({ connections: world.connections, builder }),
    getConnection: new GetConnectionUseCase({ connections: world.connections, builder }),
    saveKey: new SaveApiKeyConnectionUseCase({
      registry: world.registry,
      drivers,
      connections: world.connections,
      grants: world.grants,
      secrets: world.vault,
      audit: world.auditLogger,
      transactions: world.transactions,
      entitlements: allowAllEntitlements,
      builder,
      now,
    }),
    updateGrants: new UpdateConnectionGrantsUseCase({
      registry: world.registry,
      connections: world.connections,
      grants: world.grants,
      audit: world.auditLogger,
      transactions: world.transactions,
      builder,
      specialistSlugs,
    }),
    disconnect: new DisconnectConnectionUseCase({ connections: world.connections, revoker }),
    massRevoke: new MassRevokeConnectionsUseCase({ connections: world.connections, revoker, registry: world.registry }),
    testConnection: new TestConnectionUseCase({ connections: world.connections, health }),
    reconnectConnection: new ReconnectConnectionUseCase({ connections: world.connections, start: world.start }),
    activity: new ListConnectionActivityUseCase({ connections: world.connections, audit: world.audit }),
  };
}
