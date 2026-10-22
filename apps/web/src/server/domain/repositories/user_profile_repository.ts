import type {
  SalutationValue,
  UserMembershipSummary,
  UserProfileEntity,
} from '../entities/user_profile';

export interface UpdateUserProfileInput {
  full_name?: string;
  preferred_name?: string | null;
  salutation?: SalutationValue | null;
  phone_number?: string | null;
  about_me?: string | null;
  use_profile_in_context?: boolean;
  locale?: string;
  timezone?: string;
  /** Set by the use case when the phone number changed: a verification of the old number proves nothing about the new one. */
  reset_phone_verification?: boolean;
}

export interface UserProfileRepository {
  findById(userId: string): Promise<UserProfileEntity | null>;
  /** @throws NotFoundError when the user does not exist. */
  update(userId: string, input: UpdateUserProfileInput): Promise<UserProfileEntity>;
  listMemberships(userId: string): Promise<UserMembershipSummary[]>;
  /** The stored avatar key (`avatars/{user_id}/{version}`), or null. */
  findAvatarKey(userId: string): Promise<string | null>;
  /** @throws NotFoundError when the user does not exist. */
  setAvatarKey(userId: string, key: string | null): Promise<void>;
}
