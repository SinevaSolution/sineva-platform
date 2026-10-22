import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferencesEntity,
} from '@/server/domain/entities/user_preferences';
import type { UserPreferencesRepository } from '@/server/domain/repositories/user_preferences_repository';

export class FakeUserPreferencesRepository implements UserPreferencesRepository {
  readonly rows = new Map<string, UserPreferencesEntity>();

  async find(userId: string): Promise<UserPreferencesEntity | null> {
    return this.rows.get(userId) ?? null;
  }

  async upsert(userId: string, changes: Partial<UserPreferencesEntity>): Promise<UserPreferencesEntity> {
    const next = { ...(this.rows.get(userId) ?? DEFAULT_USER_PREFERENCES), ...changes };
    this.rows.set(userId, next);
    return next;
  }
}
