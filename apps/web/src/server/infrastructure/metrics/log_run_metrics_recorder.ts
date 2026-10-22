import 'server-only';
import type { RunLatencySample, RunMetricsRecorder } from '@/server/domain/chat/run_metrics';

/**
 * Writes one structured log line per run (FR-AIR-31). The sample type has no
 * text fields, so the line cannot leak a prompt or reply (FR-SEC-19). A
 * metrics backend replaces this adapter without touching the relay.
 */
export class LogRunMetricsRecorder implements RunMetricsRecorder {
  record(sample: RunLatencySample): void {
    console.info('[run-metrics]', JSON.stringify(sample));
  }
}
