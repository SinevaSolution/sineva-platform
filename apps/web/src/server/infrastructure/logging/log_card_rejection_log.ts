import 'server-only';
import type { CardRejectionLog } from '@/server/domain/chat/card_validator';
import { logger } from './logger';

/**
 * Rejected cards as `card.rejected` lines (FR-AX-09). The code says why; the
 * schema paths say where; the error class says what threw. The card itself,
 * its fields and its fallback text never reach the log (FR-AX-51).
 */
export class LoggerCardRejectionLog implements CardRejectionLog {
  rejected(detail: {
    code: string;
    run_handle?: string;
    issue_paths?: string[];
    cause?: unknown;
  }): void {
    logger.warn('card.rejected', {
      code: detail.code,
      run_handle: detail.run_handle,
      issue_paths: detail.issue_paths,
      reason: detail.cause instanceof Error ? detail.cause.name : undefined,
    });
  }
}
