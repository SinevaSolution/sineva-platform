import type {
  BusinessProfileRepository,
  ProfileVersionSummary,
} from '@/server/domain/repositories/business_profile_repository';

export class ListProfileVersionsUseCase {
  constructor(private readonly repo: BusinessProfileRepository) {}

  /** Newest first, without snapshots (a list of 50 full copies would be heavy). `before` is the cursor. */
  async execute(input: { workspace_id: string; limit?: number; before?: number }): Promise<ProfileVersionSummary[]> {
    return this.repo.listVersions(input.workspace_id, input.limit ?? 50, input.before);
  }
}
