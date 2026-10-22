import type { UserMembershipSummary, UserProfileEntity } from '@/server/domain/entities/user_profile';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { avatarUrlForKey } from '@/server/domain/profile/avatar';
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
    preferred_name: null,
    salutation: null,
    phone_number: null,
    phone_verified: false,
    about_me: null,
    use_profile_in_context: true,
    avatar_url: null,
    locale: 'id',
    timezone: 'Asia/Jakarta',
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export class FakeUserProfileRepository implements UserProfileRepository {
  readonly profiles = new Map<string, UserProfileEntity>();
  readonly avatarKeys = new Map<string, string | null>();
  readonly memberships = new Map<string, UserMembershipSummary[]>();
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
    const { reset_phone_verification, ...fields } = input;
    const updated: UserProfileEntity = {
      ...existing,
      ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
      phone_verified: reset_phone_verification ? false : existing.phone_verified,
    };
    this.profiles.set(userId, updated);
    return updated;
  }

  async listMemberships(userId: string): Promise<UserMembershipSummary[]> {
    return this.memberships.get(userId) ?? [];
  }

  async findAvatarKey(userId: string): Promise<string | null> {
    return this.avatarKeys.get(userId) ?? null;
  }

  async setAvatarKey(userId: string, key: string | null): Promise<void> {
    const existing = this.profiles.get(userId);
    if (!existing) {
      throw new NotFoundError('User', userId);
    }
    this.avatarKeys.set(userId, key);
    this.profiles.set(userId, { ...existing, avatar_url: avatarUrlForKey(key) });
  }
}
