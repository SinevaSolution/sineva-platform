import { buildProfilePack, type ProfilePack } from '@/server/domain/business_profile/profile_pack';
import type { BusinessProfileRepository } from '@/server/domain/repositories/business_profile_repository';

export class GetProfilePackUseCase {
  constructor(private readonly repo: BusinessProfileRepository) {}

  /**
   * The confirmed, token-capped projection the runtime receives, or null when
   * the workspace has no profile yet. Read-only; the chat path calls this to
   * learn `profile_version` and the pack.
   */
  async execute(input: { workspace_id: string }): Promise<ProfilePack | null> {
    return buildProfilePack(await this.repo.load(input.workspace_id));
  }
}
