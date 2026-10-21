import type { UserProfileEntity } from '@/server/domain/entities/user_profile';
import type {
  UpdateUserProfileInput,
  UserProfileRepository,
} from '@/server/domain/repositories/user_profile_repository';

export interface UpdateProfileUseCaseInput extends UpdateUserProfileInput {
  user_id: string;
}

export class UpdateProfileUseCase {
  constructor(private readonly profiles: UserProfileRepository) {}

  // Field values are already validated by `UpdateProfileSchema` at the edge.
  // `user_id` is the session user supplied by the route, never from the body.
  async execute(input: UpdateProfileUseCaseInput): Promise<UserProfileEntity> {
    const { user_id, ...changes } = input;
    return this.profiles.update(user_id, changes);
  }
}
