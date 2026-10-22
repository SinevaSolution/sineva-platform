import type { UserMembershipSummary, UserProfileEntity } from '@/server/domain/entities/user_profile';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { UserProfileRepository } from '@/server/domain/repositories/user_profile_repository';

export interface MeResult {
  profile: UserProfileEntity;
  memberships: UserMembershipSummary[];
}

export class GetMeUseCase {
  constructor(private readonly profiles: UserProfileRepository) {}

  async execute(userId: string): Promise<MeResult> {
    const profile = await this.profiles.findById(userId);
    if (!profile) {
      throw new NotFoundError('User', userId);
    }
    const memberships = await this.profiles.listMemberships(userId);
    return { profile, memberships };
  }
}
