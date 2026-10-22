import { randomBytes, randomUUID } from 'node:crypto';
import { CredentialResolver } from '@/server/application/connections/credential_resolver';
import { ConnectorRegistry } from '@/server/application/connections/connector_registry';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import { HandleOAuthCallbackUseCase } from '@/server/application/connections/oauth/handle_oauth_callback_use_case';
import { StartOAuthFlowUseCase, type StartOAuthFlowDeps } from '@/server/application/connections/oauth/start_oauth_flow_use_case';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import type { ConnectionLog, ConnectionStep } from '@/server/domain/connections/connection_errors';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import type { ConnectorDriver, ProviderManifest } from '@/server/domain/connections/connector';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole, WorkspaceMemberEntity } from '@/server/domain/entities/user';
import type { SecretRef } from '@/server/domain/vault/vault';
import { GenericOAuth2Driver } from '@/server/infrastructure/connectors/generic_oauth2_driver';
import { LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';
import { specialistsDeclaring } from '@/shared/specialists/connection_providers';
import { allowAllEntitlements } from '../fakes/allow_all_entitlements';
import { FakeAuditEventRepository } from '../fakes/fake_audit_event_repository';
import { FakeConnectionOAuthProvider, type FakeProviderConfig } from '../fakes/fake_connection_oauth_provider';
import { FakeTransactionRunner } from '../fakes/fake_transaction_runner';
import { InMemoryConnectionGrantRepository } from '../fakes/in_memory_connection_grant_repository';
import { InMemoryConnectionRepository } from '../fakes/in_memory_connection_repository';
import { InMemoryOAuthFlowRepository } from '../fakes/in_memory_oauth_flow_repository';
import { InMemoryVaultRepository } from '../fakes/in_memory_vault_repository';

export const WS_A = '10000000-0000-4000-8000-00000000000a';
export const WS_B = '10000000-0000-4000-8000-00000000000b';
export const OWNER = '20000000-0000-4000-8000-000000000001';
export const ADMIN = '20000000-0000-4000-8000-000000000002';
export const MEMBER = '20000000-0000-4000-8000-000000000003';
export const MEMBER_2 = '20000000-0000-4000-8000-000000000004';
export const VIEWER = '20000000-0000-4000-8000-000000000005';
export const REDIRECT_URI = 'https://app.sineva.test/api/v1/connections/oauth/callback';

export class RecordingConnectionLog implements ConnectionLog {
  readonly lines: Array<{ step: ConnectionStep; detail: Record<string, unknown> }> = [];
  failed(step: ConnectionStep, detail: Record<string, unknown>): void {
    this.lines.push({ step, detail });
  }
}

export interface World {
  registry: ConnectorRegistry;
  providers: Map<string, FakeConnectionOAuthProvider>;
  google: FakeConnectionOAuthProvider;
  notion: FakeConnectionOAuthProvider;
  flows: InMemoryOAuthFlowRepository;
  connections: InMemoryConnectionRepository;
  grants: InMemoryConnectionGrantRepository;
  vaultRows: InMemoryVaultRepository;
  vault: VaultService;
  resolver: CredentialResolver;
  audit: FakeAuditEventRepository;
  transactions: FakeTransactionRunner;
  log: RecordingConnectionLog;
  drivers: ConnectorDriverResolver;
  startDeps: Omit<StartOAuthFlowDeps, 'entitlements'>;
  start: StartOAuthFlowUseCase;
  callback: HandleOAuthCallbackUseCase;
  clock: { now: Date };
  /** Roles by workspace and user: who is a member of what. */
  roles: Map<string, UserRole>;
  context(user: string, session?: string, workspace?: string): RequestContext;
  secretRef(connectionId: string, workspaceId?: string, provider?: string): SecretRef;
}

export function buildWorld(options: { google?: Partial<FakeProviderConfig>; notion?: Partial<FakeProviderConfig> } = {}): World {
  const manifest = (id: string) => PROVIDER_MANIFESTS.find((m) => m.provider_id === id) as ProviderManifest;
  const google = new FakeConnectionOAuthProvider(manifest('google_calendar'), options.google);
  const notion = new FakeConnectionOAuthProvider(manifest('notion'), {
    access_ttl: null,
    report_scopes: false,
    issue_refresh: false,
    account: { id: 'notion-ws-1', label: 'Toko Laris' },
    ...options.notion,
  });
  const providers = new Map([
    ['google_calendar', google],
    ['notion', notion],
  ]);

  const registry = new ConnectorRegistry(PROVIDER_MANIFESTS, {
    credentialsAvailable: (m) => m.auth_type !== 'oauth2_pkce' || providers.has(m.provider_id),
    specialistsFor: specialistsDeclaring,
  });

  const drivers: ConnectorDriverResolver = {
    driverFor(providerId: string): ConnectorDriver {
      const fake = providers.get(providerId);
      if (!fake) throw new Error(`no driver for ${providerId}`);
      return new GenericOAuth2Driver(manifest(providerId), fake, {
        client_id: fake.config.client_id,
        client_secret: fake.config.client_secret,
      });
    },
  };

  const flows = new InMemoryOAuthFlowRepository();
  const connections = new InMemoryConnectionRepository();
  const grants = new InMemoryConnectionGrantRepository();
  const vaultRows = new InMemoryVaultRepository();
  const transactions = new FakeTransactionRunner();
  connections.tx = transactions;
  const vault = new VaultService(
    vaultRows,
    new LocalKms({ current: `local-world:${randomBytes(32).toString('base64')}`, production: false }),
  );
  const resolver = new CredentialResolver({ connections, secrets: vault });
  const audit = new FakeAuditEventRepository();
  const log = new RecordingConnectionLog();
  const clock = { now: new Date('2026-10-23T10:00:00.000Z') };
  const now = () => clock.now;

  const roles = new Map<string, UserRole>([
    [`${WS_A}:${OWNER}`, 'owner'],
    [`${WS_A}:${ADMIN}`, 'admin'],
    [`${WS_A}:${MEMBER}`, 'member'],
    [`${WS_A}:${MEMBER_2}`, 'member'],
    [`${WS_A}:${VIEWER}`, 'viewer'],
    [`${WS_B}:${OWNER}`, 'owner'],
  ]);
  const members = {
    async findMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberEntity | null> {
      const role = roles.get(`${workspaceId}:${userId}`);
      return role ? ({ id: randomUUID(), workspace_id: workspaceId, user_id: userId, role } as unknown as WorkspaceMemberEntity) : null;
    },
  };
  const workspaces = {
    async findById(id: string) {
      const slug = id === WS_A ? 'acme' : id === WS_B ? 'other' : null;
      return slug ? ({ id, workspace_slug: slug } as never) : null;
    },
  };
  const auditLogger = new RepositoryAuditLogger(audit);

  const startDeps: Omit<StartOAuthFlowDeps, 'entitlements'> = {
    registry,
    drivers,
    flows,
    connections,
    secrets: vault,
    workspaces,
    audit: auditLogger,
    redirectUri: REDIRECT_URI,
    clientIdFor: (providerId) => providers.get(providerId)!.config.client_id,
    now,
  };
  const start = new StartOAuthFlowUseCase({ ...startDeps, entitlements: allowAllEntitlements });
  const callback = new HandleOAuthCallbackUseCase({
    registry,
    drivers,
    flows,
    connections,
    grants,
    secrets: vault,
    resolver,
    members,
    audit: auditLogger,
    transactions,
    log,
    now,
  });

  return {
    registry,
    providers,
    google,
    notion,
    flows,
    connections,
    grants,
    vaultRows,
    vault,
    resolver,
    audit,
    transactions,
    log,
    drivers,
    startDeps,
    start,
    callback,
    clock,
    roles,
    context(user, session = `session-${user}`, workspace = WS_A) {
      return {
        user_id: user,
        workspace_id: workspace,
        role: roles.get(`${workspace}:${user}`),
        session_id: session,
        request_id: 'req_test',
        actor: { type: 'user', id: user },
      };
    },
    secretRef(connectionId, workspaceId = WS_A, provider = 'google_calendar') {
      return { owner_type: 'connection', owner_id: connectionId, workspace_id: workspaceId, provider_id: provider };
    },
  };
}

/** Parses a callback URL the way the route does and runs the use case with the given browser session. */
export async function runCallback(
  world: World,
  callbackUrl: string,
  session: { user_id: string | null; session_id: string | null },
) {
  const url = new URL(callbackUrl);
  return world.callback.execute({
    query: {
      code: url.searchParams.get('code') ?? undefined,
      state: url.searchParams.get('state') ?? undefined,
      error: url.searchParams.get('error') ?? undefined,
      iss: url.searchParams.get('iss') ?? undefined,
    },
    session,
    request_id: 'req_cb',
  });
}
