import 'server-only';
import type { RunRelayLog, RunRelayStep } from '@/server/domain/chat/run_relay_log';
import { logger } from './logger';

/** Relay failures as `run.relay_failed` lines: the step as `code`, the error class as `reason`. */
export class LoggerRunRelayLog implements RunRelayLog {
  failed(step: RunRelayStep, detail: { run_handle?: string; cause?: unknown }): void {
    logger.error('run.relay_failed', {
      code: step,
      run_handle: detail.run_handle,
      reason: detail.cause instanceof Error ? detail.cause.name : undefined,
    });
  }
}
