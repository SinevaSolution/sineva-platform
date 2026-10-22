import 'server-only';
import type { InboxLog, InboxStep } from '@/server/domain/inbox/inbox_log';
import { logger } from './logger';

/** Inbox step failures as `inbox.step_failed` lines: the step as `code`, the error class as `reason`. */
export class LoggerInboxLog implements InboxLog {
  failed(step: InboxStep, detail: { workspace_id?: string; run_handle?: string; cause?: unknown }): void {
    logger.error('inbox.step_failed', {
      code: step,
      workspace_id: detail.workspace_id,
      run_handle: detail.run_handle,
      reason: detail.cause instanceof Error ? detail.cause.name : undefined,
    });
  }
}
