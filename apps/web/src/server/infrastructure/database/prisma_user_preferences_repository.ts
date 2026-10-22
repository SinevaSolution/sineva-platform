import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import {
  DEFAULT_USER_PREFERENCES,
  DENSITIES,
  THEMES,
  type DensityPreference,
  type ThemePreference,
  type UserPreferencesEntity,
} from '@/server/domain/entities/user_preferences';
import type { UserPreferencesRepository } from '@/server/domain/repositories/user_preferences_repository';

function mapRow(row: {
  theme: string;
  density: string;
  focus_mode: boolean;
  reduce_motion: boolean;
  sidebar_collapsed: boolean;
  pause_character: boolean;
  room_view: boolean;
}): UserPreferencesEntity {
  return {
    // Strings in the database, enums in the domain: an unexpected stored
    // value falls back to the default instead of reaching the UI.
    theme: (THEMES as readonly string[]).includes(row.theme)
      ? (row.theme as ThemePreference)
      : DEFAULT_USER_PREFERENCES.theme,
    density: (DENSITIES as readonly string[]).includes(row.density)
      ? (row.density as DensityPreference)
      : DEFAULT_USER_PREFERENCES.density,
    focus_mode: row.focus_mode,
    reduce_motion: row.reduce_motion,
    sidebar_collapsed: row.sidebar_collapsed,
    pause_character: row.pause_character,
    room_view: row.room_view,
  };
}

export class PrismaUserPreferencesRepository implements UserPreferencesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(userId: string): Promise<UserPreferencesEntity | null> {
    const row = await this.prisma.userPreferences.findUnique({ where: { user_id: userId } });
    return row ? mapRow(row) : null;
  }

  async upsert(userId: string, changes: Partial<UserPreferencesEntity>): Promise<UserPreferencesEntity> {
    // `undefined` values are skipped by Prisma, so only provided fields change.
    const row = await this.prisma.userPreferences.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...changes },
      update: changes,
    });
    return mapRow(row);
  }
}
