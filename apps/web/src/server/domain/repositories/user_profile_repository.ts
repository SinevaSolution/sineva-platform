import type { UserProfileEntity } from '../entities/user_profile';

export interface UpdateUserProfileInput {
  full_name?: string;
  locale?: string;
  timezone?: string;
}

export interface UserProfileRepository {
  findById(userId: string): Promise<UserProfileEntity | null>;
  /** @throws NotFoundError when the user does not exist. */
  update(userId: string, input: UpdateUserProfileInput): Promise<UserProfileEntity>;
}
