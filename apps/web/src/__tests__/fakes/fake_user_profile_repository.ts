import type { UserProfileEntity } from '@/server/domain/entities/user_profile';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type {
  UpdateUserProfileInput,
  UserProfileRepository,
} from '@/server/domain/repositories/user_profile_repository';

export function buildUserProfile(overrides: Partial<UserProfileEntity> = {}): UserProfileEntity {
  return {
    id: 'usr-1',
    email: 'amira@example.com',
    email_verified: true,
    full_name: 'Amira Putri',
    avatar_url: null,
    locale: 'id',
    timezone: 'Asia/Jakarta',
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export class FakeUserProfileRepository implements UserProfileRepository {
  readonly profiles = new Map<string, UserProfileEntity>();
  readonly updateCalls: Array<{ user_id: string; input: UpdateUserProfileInput }> = [];

  seed(profile: UserProfileEntity): void {
    this.profiles.set(profile.id, profile);
  }

  async findById(userId: string): Promise<UserProfileEntity | null> {
    return this.profiles.get(userId) ?? null;
  }

  async update(userId: string, input: UpdateUserProfileInput): Promise<UserProfileEntity> {
    this.updateCalls.push({ user_id: userId, input });
    const existing = this.profiles.get(userId);
    if (!existing) {
      throw new NotFoundError('User', userId);
    }
    const updated = { ...existing, ...input };
    this.profiles.set(userId, updated);
    return updated;
  }
}
