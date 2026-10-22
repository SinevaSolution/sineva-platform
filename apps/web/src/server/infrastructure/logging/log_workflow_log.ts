import 'server-only';
import type { WorkflowLog, WorkflowLogEvent, WorkflowLogFields } from '@/server/domain/workflows/workflow_ports';
import { logger } from './logger';

// Adapter for the Workflow log port. The port carries ids, codes and counts
// only, and the logger enforces its own allowlist on top, so step text,
// inputs or outputs cannot reach a log line through here.
export class LoggerWorkflowLog implements WorkflowLog {
  warn(event: WorkflowLogEvent, fields: WorkflowLogFields): void {
    logger.warn(event, {
      ...(fields.workspace_id ? { workspace_id: fields.workspace_id } : {}),
      ...(fields.run_handle ? { run_handle: fields.run_handle } : {}),
      ...(fields.reason ? { reason: fields.reason } : {}),
      ...(fields.code ? { code: fields.code } : {}),
      ...(fields.status !== undefined ? { status: fields.status } : {}),
    });
  }
}
