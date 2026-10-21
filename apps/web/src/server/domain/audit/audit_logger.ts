import type { RequestContext } from '@/server/domain/context/request_context';

export interface AuditEvent {
  action: string;
  context: RequestContext;
  target_resource_id?: string;
  target_resource_type?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface AuditLogger {
  log(event: AuditEvent): Promise<void>;
}

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
