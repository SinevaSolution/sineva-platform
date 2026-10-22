import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { ProfileVersionEntity } from '@/server/domain/business_profile/business_profile';
import { diffSnapshots, type SnapshotChange } from '@/server/domain/business_profile/profile_diff';
import type { BusinessProfileRepository } from '@/server/domain/repositories/business_profile_repository';

export class GetProfileVersionUseCase {
  constructor(private readonly repo: BusinessProfileRepository) {}

  /** One version with its snapshot and the diff against the version before it. */
  async execute(input: {
    workspace_id: string;
    version: number;
  }): Promise<{ version: ProfileVersionEntity; diff: SnapshotChange[] }> {
    const version = await this.repo.getVersion(input.workspace_id, input.version);
    if (!version) {
      throw new NotFoundError('Profile version', String(input.version));
    }
    const previous = input.version > 1 ? await this.repo.getVersion(input.workspace_id, input.version - 1) : null;
    return { version, diff: diffSnapshots(previous?.snapshot ?? null, version.snapshot) };
  }
}
