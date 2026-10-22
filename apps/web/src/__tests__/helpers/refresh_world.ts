import type { ConnectionIncidentNotifier as NotifierType } from '@/server/application/connections/refresh/connection_incident_notifier';
import { ConnectionIncidentNotifier } from '@/server/application/connections/refresh/connection_incident_notifier';
import { ConnectionHealthService } from '@/server/application/connections/refresh/connection_health_service';
import { ConnectionStateService } from '@/server/application/connections/refresh/connection_state_service';
import {
  HealthPlanner,
  RefreshPlanner,
  registerConnectionJobs,
} from '@/server/application/connections/refresh/connection_jobs';
import { ReconcileConnectionsUseCase } from '@/server/application/connections/refresh/reconcile_connections_use_case';
import { RefreshConnectionTokenUseCase } from '@/server/application/connections/refresh/refresh_connection_token_use_case';
import { JobRunner } from '@/server/application/jobs/job_runner';
import type { RepositoryAuditLogger as AuditLoggerType } from '@/server/application/audit/repository_audit_logger';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import type { CreatedInboxItem, InboxItemCreator, NewInboxItem } from '@/server/domain/inbox/inbox_item_creator';
import type { JobLog, JobLogEvent } from '@/server/domain/jobs/job_log';
import { FakeEmailSender } from '@/server/infrastructure/email/fake_email_sender';
import { InMemoryJobQueue } from '../fakes/in_memory_job_queue';
import { renderEmailTemplate } from '@/server/application/email/templates';
import { OWNER, WS_A, buildWorld, runCallback, type World } from './connections_world';

export class RecordingInboxCreator implements InboxItemCreator {
  readonly items: NewInboxItem[] = [];
  failWith: Error | null = null;
  async create(input: NewInboxItem): Promise<CreatedInboxItem> {
    if (this.failWith) throw this.failWith;
    const existing = this.items.find((item) => item.kind === 'result' && input.kind === 'result' && item.dedupe_key === input.dedupe_key);
    if (!existing) this.items.push(input);
    return { created: !existing } as CreatedInboxItem;
  }
}

class RecordingJobLog implements JobLog {
  readonly lines: Array<{ event: JobLogEvent; detail: Record<string, unknown> }> = [];
  record(event: JobLogEvent, detail: Record<string, unknown>): void {
    this.lines.push({ event, detail });
  }
}

export interface RefreshWorld extends World {
  queue: InMemoryJobQueue;
  inbox: RecordingInboxCreator;
  email: FakeEmailSender;
  jobLog: RecordingJobLog;
  notifier: NotifierType;
  state: ConnectionStateService;
  refresh: RefreshConnectionTokenUseCase;
  health: ConnectionHealthService;
  reconcile: ReconcileConnectionsUseCase;
  runner: JobRunner;
  refreshPlanner: RefreshPlanner;
  healthPlanner: HealthPlanner;
  auditLogger: AuditLoggerType;
  /** Connects Google Calendar through the real flow, so the vault and rows are realistic. */
  connectGoogle(over?: { bundle?: string }): Promise<string>;
}

export function buildRefreshWorld(options: Parameters<typeof buildWorld>[0] = {}): RefreshWorld {
  const world = buildWorld(options);
  const queue = new InMemoryJobQueue();
  const inbox = new RecordingInboxCreator();
  const email = new FakeEmailSender(renderEmailTemplate);
  const jobLog = new RecordingJobLog();
  const auditLogger = new RepositoryAuditLogger(world.audit);
  const now = () => world.clock.now;

  const accounts = {
    async findById(id: string) {
      return id === OWNER
        ? { id, email: 'owner@acme.test', email_verified: true, full_name: 'Owner Acme', preferred_name: 'Budi', locale: 'id' }
        : null;
    },
  };
  const notifier = new ConnectionIncidentNotifier({
    inbox,
    accounts,
    email,
    workspaces: { findById: async (id: string) => ({ id, workspace_slug: id === WS_A ? 'acme' : 'other' }) as never },
    registry: world.registry,
    appUrl: 'https://app.sineva.test',
    log: world.log,
  });
  const state = new ConnectionStateService({
    connections: world.connections,
    audit: auditLogger,
    transactions: world.transactions,
    incidents: notifier,
  });
  const refresh = new RefreshConnectionTokenUseCase({
    connections: world.connections,
    resolver: world.resolver,
    secrets: world.vault,
    drivers: world.drivers,
    audit: auditLogger,
    transactions: world.transactions,
    state,
    log: world.log,
    now,
  });
  const health = new ConnectionHealthService({
    connections: world.connections,
    resolver: world.resolver,
    drivers: world.drivers,
    refresh,
    state,
    log: world.log,
    now,
  });
  const reconcile = new ReconcileConnectionsUseCase({ connections: world.connections, queue, log: world.log, now });
  const runner = new JobRunner({ queue, log: jobLog, workerId: 'w1', now, random: () => 0.5 });
  registerConnectionJobs(runner, { refresh, health, reconcile, incidents: notifier, connections: world.connections, queue });
  const refreshPlanner = new RefreshPlanner({ connections: world.connections, queue, random: () => 0.5 });
  const healthPlanner = new HealthPlanner({ connections: world.connections, queue });

  return {
    ...world,
    queue,
    inbox,
    email,
    jobLog,
    notifier,
    state,
    refresh,
    health,
    reconcile,
    runner,
    refreshPlanner,
    healthPlanner,
    auditLogger,
    async connectGoogle(over = {}) {
      const started = await world.start.execute({
        context: world.context(OWNER),
        provider_id: 'google_calendar',
        scope_bundle: over.bundle ?? 'calendar_read',
        owner_scope: 'workspace',
      });
      const result = await runCallback(world, world.google.authorize(started.authorization_url), {
        user_id: OWNER,
        session_id: 'session-' + OWNER,
      });
      if (!result.connection_id) throw new Error(`connect failed: ${result.result}`);
      return result.connection_id;
    },
  };
}
