import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  createAnonymousRequestContext,
  type RequestContext,
} from '@/server/domain/context/request_context';
import type { WorkspaceMemberEntity } from '@/server/domain/entities/user';
import type {
  UpdateOwnMemberAttributesInput,
  WorkspaceMemberRepository,
} from '@/server/domain/repositories/workspace_member_repository';

export interface UpdateMemberProfileInput extends UpdateOwnMemberAttributesInput {
  /** The session user. */
  user_id: string;
  /** The workspace from the URL, already matched to the session's membership by the route guard. */
  workspace_id: string;
  context?: RequestContext;
}

export class UpdateMemberProfileUseCase {
  constructor(
    private readonly members: WorkspaceMemberRepository,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: UpdateMemberProfileInput): Promise<WorkspaceMemberEntity> {
    const { user_id, workspace_id, context, ...changes } = input;
    const changedFields = (Object.keys(changes) as Array<keyof UpdateOwnMemberAttributesInput>).filter(
      (field) => changes[field] !== undefined,
    );

    const updated = await this.members.updateOwnAttributes(workspace_id, user_id, changes);

    await this.auditLogger.log({
      action: 'member.profile_updated',
      context: context ?? { ...createAnonymousRequestContext('member-profile-update'), user_id },
      workspace_id,
      target_resource_type: 'workspace_member',
      target_resource_id: updated.id,
      metadata: { changed_fields: changedFields },
    });

    return updated;
  }
}
