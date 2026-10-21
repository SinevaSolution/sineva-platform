import type { UserProfileEntity } from '@/server/domain/entities/user_profile';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { UserProfileRepository } from '@/server/domain/repositories/user_profile_repository';

export class GetProfileUseCase {
  constructor(private readonly profiles: UserProfileRepository) {}

  async execute(userId: string): Promise<UserProfileEntity> {
    const profile = await this.profiles.findById(userId);
    if (!profile) {
      throw new NotFoundError('User', userId);
    }
    return profile;
  }
}
