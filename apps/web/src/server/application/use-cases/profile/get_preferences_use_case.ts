import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferencesEntity,
} from '@/server/domain/entities/user_preferences';
import type { UserPreferencesRepository } from '@/server/domain/repositories/user_preferences_repository';

export class GetPreferencesUseCase {
  constructor(private readonly preferences: UserPreferencesRepository) {}

  // A read never creates the row: defaults are applied here, so a user who
  // never saved anything costs no write and picks up default changes.
  async execute(userId: string): Promise<UserPreferencesEntity> {
    return (await this.preferences.find(userId)) ?? { ...DEFAULT_USER_PREFERENCES };
  }
}
