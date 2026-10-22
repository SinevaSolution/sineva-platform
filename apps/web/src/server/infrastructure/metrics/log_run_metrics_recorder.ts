import 'server-only';
import type { RunLatencySample, RunMetricsRecorder } from '@/server/domain/chat/run_metrics';
import { logger } from '@/server/infrastructure/logging/logger';

/**
 * One `run.metrics` log line per run (FR-AIR-31): outcome as `code`, reply
 * language as `locale`, timings in ms. The logger's allowlist keeps text out
 * even if the sample type grew a content field by mistake (FR-SEC-19).
 */
export class LogRunMetricsRecorder implements RunMetricsRecorder {
  record(sample: RunLatencySample): void {
    logger.info('run.metrics', {
      code: sample.outcome,
      agent_slug: sample.agent_slug,
      locale: sample.reply_language,
      first_token_ms: sample.first_token_ms ?? undefined,
      total_ms: sample.total_ms,
    });
  }
}
