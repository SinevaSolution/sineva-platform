import 'server-only';
import type { ConnectionLog, ConnectionMetric, ConnectionStep } from '@/server/domain/connections/connection_errors';
import { logger } from './logger';

/** Connection step failures as `connection.step_failed` lines: the step as `code`, a short reason, opaque ids only. */
export class LoggerConnectionLog implements ConnectionLog {
  failed(
    step: ConnectionStep,
    detail: { workspace_id?: string; connection_id?: string; provider_id?: string; code?: string },
  ): void {
    logger.error('connection.step_failed', {
      code: step,
      reason: detail.code,
      workspace_id: detail.workspace_id,
      connection_id: detail.connection_id,
      provider_id: detail.provider_id,
    });
  }

  metric(name: ConnectionMetric, detail: { provider_id?: string; code?: string }): void {
    logger.info('connection.metric', { code: name, reason: detail.code, provider_id: detail.provider_id });
  }
}
