import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { BusinessProfileRepository } from '@/server/domain/repositories/business_profile_repository';
import type { BusinessProfileWriter } from './profile_writer';
import { toProfileResult, type BusinessProfileResult } from './get_business_profile_use_case';

export class RestoreProfileVersionUseCase {
  constructor(private readonly deps: { writer: BusinessProfileWriter; repo: BusinessProfileRepository }) {}

  /**
   * Writes a NEW version holding the old content. History is never rewritten:
   * the restore itself shows up in the list with `restored_from`.
   */
  async execute(input: {
    workspace_id: string;
    user_id: string;
    version: number;
    context: RequestContext;
  }): Promise<BusinessProfileResult & { version: number }> {
    const target = await this.deps.repo.getVersion(input.workspace_id, input.version);
    if (!target) {
      throw new NotFoundError('Profile version', String(input.version));
    }

    const result = await this.deps.writer.mutate(
      {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        context: input.context,
        kind: 'restore',
        restored_from: input.version,
        audit_action: 'profile.version_restored',
      },
      async (repo) => {
        await repo.replaceContents(input.workspace_id, target.snapshot, input.user_id);
        return { restored_from: input.version };
      },
    );
    return { ...toProfileResult(input.workspace_id, result.aggregate), version: result.version };
  }
}
