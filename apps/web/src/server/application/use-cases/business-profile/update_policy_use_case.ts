import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { PolicyEntity } from '@/server/domain/business_profile/business_profile';
import { inspectProfileText, type ProfileWarning } from '@/server/domain/business_profile/profile_text_guard';
import type {
  BusinessProfileRepository,
  UpdatePolicyInput,
} from '@/server/domain/repositories/business_profile_repository';
import type { PolicyUpdateDto } from '@/server/application/dtos/business_profile_dto';
import type { BusinessProfileWriter } from './profile_writer';

export class UpdatePolicyUseCase {
  constructor(
    private readonly deps: { writer: BusinessProfileWriter; repo: BusinessProfileRepository; now: () => Date },
  ) {}

  async execute(input: {
    workspace_id: string;
    user_id: string;
    policy_id: string;
    input: PolicyUpdateDto;
    context: RequestContext;
  }): Promise<{ policy: PolicyEntity; version: number; warnings: ProfileWarning[] }> {
    const dto = input.input;
    const warnings = inspectProfileText([
      ...(dto.title ? [{ field: 'policies.title', text: dto.title }] : []),
      ...(dto.body ? [{ field: 'policies.body', text: dto.body }] : []),
    ]);

    const patch: UpdatePolicyInput = { updated_by: input.user_id };
    if (dto.kind !== undefined) patch.kind = dto.kind;
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.body !== undefined) patch.body = dto.body;
    if (dto.confirmed !== undefined) {
      patch.confirmed_at = dto.confirmed ? this.deps.now().toISOString() : null;
    }
    // Editing the text of a confirmed policy is the owner's act of confirming
    // the new text, so the timestamp moves with it.
    if ((dto.title !== undefined || dto.body !== undefined) && dto.confirmed === undefined) {
      patch.confirmed_at = this.deps.now().toISOString();
    }

    let updated: PolicyEntity | null = null;
    const result = await this.deps.writer.mutate(
      {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        context: input.context,
        audit_action: 'policy.updated',
      },
      async (repo) => {
        updated = await repo.updatePolicy(input.workspace_id, input.policy_id, patch);
        if (!updated) {
          throw new NotFoundError('Policy', input.policy_id);
        }
        return { policy_id: updated.id, kind: updated.kind };
      },
    );
    return { policy: updated as unknown as PolicyEntity, version: result.version, warnings };
  }
}
