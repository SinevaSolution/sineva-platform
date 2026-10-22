import type { JobLog } from '@/server/domain/jobs/job_log';
import type { JobQueue } from '@/server/domain/jobs/job_queue';
import type { JobRunner } from './job_runner';

/** Enqueues whatever is due (for example token refreshes). Must be idempotent: a tick can run twice. */
export interface JobPlanner {
  name: string;
  plan(now: Date): Promise<number>;
}

export interface TickResult {
  planned: number;
  reaped: number;
  ran: number;
  succeeded: number;
  retried: number;
  failed: number;
  planner_errors: number;
}

/**
 * One scheduler beat: plan, take back jobs whose worker died, run what is
 * ready. Order matters: planning first lets a freshly planned job run in the
 * same beat, reaping before running lets a recovered job run in it too.
 */
export class TickJobsUseCase {
  constructor(
    private readonly deps: {
      queue: JobQueue;
      runner: JobRunner;
      planners: readonly JobPlanner[];
      log: JobLog;
      now?: () => Date;
    },
  ) {}

  async execute(input: { max_jobs: number }): Promise<TickResult> {
    const now = (this.deps.now ?? (() => new Date()))();
    let planned = 0;
    let plannerErrors = 0;
    for (const planner of this.deps.planners) {
      try {
        planned += await planner.plan(now);
      } catch (error) {
        // One broken planner must not stop the queue from draining; the count
        // and a log line make the failure visible (no silent fallback).
        plannerErrors += 1;
        this.deps.log.record('job.failed', {
          job_type: `planner:${planner.name}`,
          code: error instanceof Error ? error.name : 'unknown',
        });
      }
    }

    const reaped = await this.deps.queue.reapExpired(now);
    if (reaped > 0) this.deps.log.record('job.lease_reaped', { count: reaped });

    const batch = await this.deps.runner.runBatch(input.max_jobs);
    return { planned, reaped, ...batch, planner_errors: plannerErrors };
  }
}
