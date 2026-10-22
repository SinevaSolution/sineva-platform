// What the job runner reports. A port so the application layer does not know
// how it is logged. Details carry the job type, an opaque job id and a stable
// code, never the payload.

export type JobLogEvent =
  | 'job.started'
  | 'job.succeeded'
  | 'job.retry_scheduled'
  | 'job.failed'
  | 'job.lease_reaped';

export interface JobLog {
  record(
    event: JobLogEvent,
    detail: { job_type?: string; job_id?: string; attempt?: number; code?: string; count?: number },
  ): void;
}
