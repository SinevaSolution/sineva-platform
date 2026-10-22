import type { IngestAuditEventDto } from '@/server/application/audit/ingest_audit_event_dto';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';

// Writes events reported by sineva-ai. The caller is authenticated by the
// internal API key only, which is transport trust and not identity, so the
// body is treated as a claim: a workspace id is accepted only if that
// workspace exists (a typo or a forged id cannot create rows under a
// non-existent tenant), and redaction runs in the same writer as every other
// event. An event with no workspace is allowed because some, like
// `context.verification_failed`, are raised exactly when no tenant could be
// trusted.
export class IngestAuditEventUseCase {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly audit: AuditLogger,
  ) {}

  async execute(input: IngestAuditEventDto, requestId: string): Promise<void> {
    if (input.workspace_id) {
      const workspace = await this.workspaces.findById(input.workspace_id);
      if (!workspace) {
        throw new NotFoundError('Workspace', input.workspace_id);
      }
    }

    await this.audit.log({
      action: input.action,
      // The caller's request id wins so the row correlates with sineva-ai's
      // own logs; the id of this ingest call is the fallback.
      context: {
        user_id: 'system:sineva-ai',
        session_id: 'internal',
        request_id: input.request_id ?? requestId,
        actor: { type: 'system', id: 'sineva-ai' },
      },
      actor: { type: input.actor_type, id: input.actor_id },
      ...(input.workspace_id ? { workspace_id: input.workspace_id } : {}),
      ...(input.on_behalf_of_user_id ? { on_behalf_of_user_id: input.on_behalf_of_user_id } : {}),
      ...(input.target_type ? { target_resource_type: input.target_type } : {}),
      ...(input.target_id ? { target_resource_id: input.target_id } : {}),
      outcome: input.outcome,
      ...(input.reason_code ? { reason_code: input.reason_code } : {}),
      ...(input.run_id ? { run_id: input.run_id } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  }
}
