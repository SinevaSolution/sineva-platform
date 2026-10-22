import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { BusinessProfileWriter } from './profile_writer';

export class DeletePolicyUseCase {
  constructor(private readonly deps: { writer: BusinessProfileWriter }) {}

  async execute(input: {
    workspace_id: string;
    user_id: string;
    policy_id: string;
    context: RequestContext;
  }): Promise<{ version: number }> {
    const result = await this.deps.writer.mutate(
      {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        context: input.context,
        // The PRD lists policy.created and policy.updated only; a removal is a
        // profile change and is audited as one.
        audit_action: 'profile.updated',
      },
      async (repo) => {
        if (!(await repo.deletePolicy(input.workspace_id, input.policy_id))) {
          throw new NotFoundError('Policy', input.policy_id);
        }
        return { section: 'policies', op: 'deleted', policy_id: input.policy_id };
      },
    );
    return { version: result.version };
  }
}
