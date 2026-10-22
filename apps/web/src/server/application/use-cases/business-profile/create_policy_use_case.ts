import type { RequestContext } from '@/server/domain/context/request_context';
import type { PolicyEntity } from '@/server/domain/business_profile/business_profile';
import { inspectProfileText, type ProfileWarning } from '@/server/domain/business_profile/profile_text_guard';
import type { PolicyCreateDto } from '@/server/application/dtos/business_profile_dto';
import type { BusinessProfileWriter } from './profile_writer';

export class CreatePolicyUseCase {
  constructor(private readonly deps: { writer: BusinessProfileWriter; now: () => Date }) {}

  async execute(input: {
    workspace_id: string;
    user_id: string;
    input: PolicyCreateDto;
    context: RequestContext;
  }): Promise<{ policy: PolicyEntity; version: number; warnings: ProfileWarning[] }> {
    const dto = input.input;
    const warnings = inspectProfileText([
      { field: 'policies.title', text: dto.title },
      { field: 'policies.body', text: dto.body },
    ]);

    let created: PolicyEntity | null = null;
    const result = await this.deps.writer.mutate(
      {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        context: input.context,
        audit_action: 'policy.created',
      },
      async (repo) => {
        created = await repo.createPolicy(input.workspace_id, {
          kind: dto.kind,
          title: dto.title,
          body: dto.body,
          source: dto.source ?? 'user',
          confirmed_at: dto.confirmed === false ? null : this.deps.now().toISOString(),
          updated_by: input.user_id,
        });
        return { policy_id: created.id, kind: created.kind };
      },
    );
    return { policy: created as unknown as PolicyEntity, version: result.version, warnings };
  }
}
