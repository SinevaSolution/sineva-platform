import type { RequestContext } from '@/server/domain/context/request_context';
import type { AuditActorType, AuditChange, AuditOutcome } from '@/server/domain/audit/audit_event';

export interface AuditEvent {
  /** Dotted, past tense: `workspace.created`. */
  action: string;
  context: RequestContext;
  target_resource_id?: string;
  target_resource_type?: string;
  /** Ids, counts and field names only. Never message text, tokens or personal data. */
  metadata?: Record<string, unknown>;
  timestamp?: Date;
  /** Overrides the workspace of the context (events about another workspace). */
  workspace_id?: string;
  /** Overrides the actor derived from the context (a specialist acting for a user). */
  actor?: { type: AuditActorType; id: string };
  on_behalf_of_user_id?: string;
  outcome?: AuditOutcome;
  reason_code?: string;
  run_id?: string;
  /** Redacted before and after values of the changed fields. */
  change?: AuditChange;
  ip?: string;
  user_agent?: string;
}

export interface AuditLogger {
  /**
   * Appends one event. A failed write rejects: a privileged action must not
   * report success without its audit row (security PRD, data integrity).
   */
  log(event: AuditEvent): Promise<void>;
}

/** In-memory logger for unit tests. Production wiring uses `RepositoryAuditLogger`. */
export class CountingAuditLogger implements AuditLogger {
  private events: AuditEvent[] = [];

  async log(event: AuditEvent): Promise<void> {
    this.events.push({
      ...event,
      timestamp: event.timestamp ?? new Date(),
    });
  }

  getEventCount(): number {
    return this.events.length;
  }

  getEvents(): ReadonlyArray<AuditEvent> {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

export const defaultAuditLogger = new CountingAuditLogger();
