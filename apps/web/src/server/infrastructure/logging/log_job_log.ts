import 'server-only';
import type { JobLog, JobLogEvent } from '@/server/domain/jobs/job_log';
import { logger } from './logger';

/** Job runner lines through the allowlisted logger. The payload is never part of `detail`. */
export class LoggerJobLog implements JobLog {
  record(
    event: JobLogEvent,
    detail: { job_type?: string; job_id?: string; attempt?: number; code?: string; count?: number },
  ): void {
    const fields = {
      job_type: detail.job_type,
      job_id: detail.job_id,
      attempt: detail.attempt,
      code: detail.code,
      count: detail.count,
    };
    if (event === 'job.failed') logger.error(event, fields);
    else if (event === 'job.retry_scheduled' || event === 'job.lease_reaped') logger.warn(event, fields);
    else logger.info(event, fields);
  }
}
