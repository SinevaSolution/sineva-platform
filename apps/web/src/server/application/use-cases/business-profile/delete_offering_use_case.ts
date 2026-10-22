import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { BusinessProfileWriter } from './profile_writer';

export class DeleteOfferingUseCase {
  constructor(private readonly deps: { writer: BusinessProfileWriter }) {}

  async execute(input: {
    workspace_id: string;
    user_id: string;
    offering_id: string;
    context: RequestContext;
  }): Promise<{ version: number }> {
    const result = await this.deps.writer.mutate(
      {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        context: input.context,
        audit_action: 'profile.updated',
      },
      async (repo) => {
        if (!(await repo.deleteOffering(input.workspace_id, input.offering_id))) {
          throw new NotFoundError('Offering', input.offering_id);
        }
        return { section: 'offerings', op: 'deleted' };
      },
    );
    return { version: result.version };
  }
}
