import { computeRefreshAt } from '@/server/domain/connections/refresh_schedule';
import { FatalJobError } from '@/server/domain/jobs/job';
import type { JobEntity } from '@/server/domain/jobs/job';
import type { JobQueue } from '@/server/domain/jobs/job_queue';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { JobRunner } from '../../jobs/job_runner';
import type { JobPlanner } from '../../jobs/tick_jobs_use_case';
import type { ConnectionIncidentNotifier } from './connection_incident_notifier';
import type { ConnectionHealthService } from './connection_health_service';
import type { ReconcileConnectionsUseCase } from './reconcile_connections_use_case';
import type { RefreshConnectionTokenUseCase } from './refresh_connection_token_use_case';

export const CONNECTION_JOBS = {
  REFRESH: 'connection.refresh',
  HEALTH: 'connection.health',
  RECONCILE: 'connection.reconcile',
  ROTATION_REMINDER: 'connection.rotation_reminder',
} as const;

export const SECRET_ROTATION_MS = 90 * 24 * 3_600_000;

const DAY_MS = 24 * 3_600_000;
// How far ahead of expiry a connection can be and still be looked at, and how far
// ahead of its refresh time a job is queued. The planner runs about once a minute.
const PLANNING_WINDOW_MS = 6 * 3_600_000;
const PLANNING_HORIZON_MS = 5 * 60_000;
const PLANNER_BATCH = 200;
export const RECONCILE_BATCH = 100;

interface ConnectionJobPayload {
  workspace_id: string;
  connection_id: string;
}

function parsePayload(job: JobEntity): ConnectionJobPayload {
  const { workspace_id, connection_id } = job.payload;
  if (typeof workspace_id !== 'string' || typeof connection_id !== 'string') {
    throw new FatalJobError('invalid_payload');
  }
  return { workspace_id, connection_id };
}

export interface ConnectionJobDeps {
  refresh: Pick<RefreshConnectionTokenUseCase, 'execute'>;
  health: Pick<ConnectionHealthService, 'probe'>;
  reconcile: Pick<ReconcileConnectionsUseCase, 'execute'>;
  incidents: Pick<ConnectionIncidentNotifier, 'rotationDue'>;
  connections: ConnectionRepository;
  queue: JobQueue;
}

/** Wires the three job types of the connection layer into the runner. */
export function registerConnectionJobs(runner: JobRunner, deps: ConnectionJobDeps): void {
  runner.register(CONNECTION_JOBS.REFRESH, async (job) => {
    const payload = parsePayload(job);
    const outcome = await deps.refresh.execute({ ...payload, request_id: job.id });
    if (outcome === 'needs_reconnect') {
      // The state is already recorded and the person told. Failing the job, with
      // the reason, is what stops retries and leaves a visible row (FR-CONN-22).
      const connection = await deps.connections.findById(payload.workspace_id, payload.connection_id);
      throw new FatalJobError(connection?.last_error_code ?? 'needs_reconnect');
    }
  });

  runner.register(CONNECTION_JOBS.HEALTH, async (job) => {
    const payload = parsePayload(job);
    const connection = await deps.connections.findById(payload.workspace_id, payload.connection_id);
    if (!connection) return;
    await deps.health.probe(connection, { request_id: job.id, allow_recovery: true });
  });

  runner.register(CONNECTION_JOBS.ROTATION_REMINDER, async (job) => {
    const payload = parsePayload(job);
    const connection = await deps.connections.findById(payload.workspace_id, payload.connection_id);
    if (!connection || connection.status === 'revoked' || connection.auth_type !== 'api_key') return;
    await deps.incidents.rotationDue(connection);
  });

  runner.register(CONNECTION_JOBS.RECONCILE, async (job, context) => {
    const afterId = typeof job.payload.after_id === 'string' ? job.payload.after_id : null;
    const sweepId = typeof job.payload.sweep_id === 'string' ? job.payload.sweep_id : job.id;
    const result = await deps.reconcile.execute({ after_id: afterId, batch_size: RECONCILE_BATCH, sweep_id: sweepId });
    if (result.next_after_id) {
      // The next batch is its own durable job, so a restart mid-sweep loses nothing.
      await deps.queue.enqueue(
        {
          job_type: CONNECTION_JOBS.RECONCILE,
          payload: { after_id: result.next_after_id, sweep_id: sweepId },
          idempotency_key: `reconcile-batch:${sweepId}:${result.next_after_id}`,
        },
        context.now,
      );
    }
  });
}

/**
 * Queues a refresh for each connection whose token is due (FR-CONN-20). The
 * idempotency key carries the expiry, so a tick that runs twice makes one job,
 * and the key changes after a successful refresh moves the expiry, so the next
 * cycle is planned fresh. The concurrency key is the connection, shared with the
 * health job, so a refresh and a probe of one connection never run together.
 */
export class RefreshPlanner implements JobPlanner {
  readonly name = 'connection_refresh';

  constructor(
    private readonly deps: {
      connections: ConnectionRepository;
      queue: JobQueue;
      random?: () => number;
    },
  ) {}

  async plan(now: Date): Promise<number> {
    const candidates = await this.deps.connections.listRefreshCandidates(now, PLANNING_WINDOW_MS, PLANNER_BATCH);
    let planned = 0;
    for (const connection of candidates) {
      const expiresAt = connection.access_expires_at;
      if (!expiresAt) continue;
      const issuedAt = connection.last_refreshed_at ?? connection.created_at;
      const dueAt = computeRefreshAt(issuedAt, expiresAt, this.deps.random);
      if (dueAt.getTime() > now.getTime() + PLANNING_HORIZON_MS) continue;
      const { created } = await this.deps.queue.enqueue(
        {
          job_type: CONNECTION_JOBS.REFRESH,
          payload: { workspace_id: connection.workspace_id, connection_id: connection.id },
          workspace_id: connection.workspace_id,
          run_at: dueAt.getTime() > now.getTime() ? dueAt : now,
          concurrency_key: `connection:${connection.id}`,
          idempotency_key: `refresh:${connection.id}:${expiresAt.getTime()}`,
        },
        now,
      );
      if (created) planned += 1;
    }
    return planned;
  }
}

/** Queues the daily health probe (FR-CONN-23): one per connection per day. */
export class HealthPlanner implements JobPlanner {
  readonly name = 'connection_health';

  constructor(private readonly deps: { connections: ConnectionRepository; queue: JobQueue }) {}

  async plan(now: Date): Promise<number> {
    const due = await this.deps.connections.listHealthDue(new Date(now.getTime() - DAY_MS), PLANNER_BATCH);
    const day = now.toISOString().slice(0, 10);
    let planned = 0;
    for (const connection of due) {
      const { created } = await this.deps.queue.enqueue(
        {
          job_type: CONNECTION_JOBS.HEALTH,
          payload: { workspace_id: connection.workspace_id, connection_id: connection.id },
          workspace_id: connection.workspace_id,
          concurrency_key: `connection:${connection.id}`,
          idempotency_key: `health:${connection.id}:${day}`,
        },
        now,
      );
      if (created) planned += 1;
    }
    return planned;
  }
}

/**
 * Queues the 90 day reminder for pasted keys (FR-CONN-30), once per key: the
 * idempotency key carries the time the key was saved, so a replaced key restarts
 * the clock and a tick that runs twice makes one job.
 */
export class RotationReminderPlanner implements JobPlanner {
  readonly name = 'connection_rotation_reminder';

  constructor(private readonly deps: { connections: ConnectionRepository; queue: JobQueue }) {}

  async plan(now: Date): Promise<number> {
    const due = await this.deps.connections.listRotationDue(new Date(now.getTime() - SECRET_ROTATION_MS), PLANNER_BATCH);
    let planned = 0;
    for (const connection of due) {
      const keyAge = (connection.secret_rotated_at ?? connection.created_at).getTime();
      const { created } = await this.deps.queue.enqueue(
        {
          job_type: CONNECTION_JOBS.ROTATION_REMINDER,
          payload: { workspace_id: connection.workspace_id, connection_id: connection.id },
          workspace_id: connection.workspace_id,
          idempotency_key: `rotation:${connection.id}:${keyAge}`,
        },
        now,
      );
      if (created) planned += 1;
    }
    return planned;
  }
}
