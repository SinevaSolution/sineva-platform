import type { UserPreferencesEntity } from '../entities/user_preferences';

export interface UserPreferencesRepository {
  /** Null when the user never saved a preference (the caller applies defaults). */
  find(userId: string): Promise<UserPreferencesEntity | null>;
  /** Creates the row on first save and merges the provided fields afterwards. */
  upsert(userId: string, changes: Partial<UserPreferencesEntity>): Promise<UserPreferencesEntity>;
}
