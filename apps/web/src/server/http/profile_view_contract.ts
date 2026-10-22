import type {
  AvatarUploadTicketView,
  MembershipView,
  PreferencesView,
  ProfileView,
} from '@/shared/profile_view';
import type { UserMembershipSummary, UserProfileEntity } from '../domain/entities/user_profile';
import type { UserPreferencesEntity } from '../domain/entities/user_preferences';
import type { AvatarUploadTicket } from '../application/use-cases/profile/request_avatar_upload_use_case';

// Compile-time drift guard, same approach as `agent_view_contract.ts`: the
// routes serialise these server shapes and the client types them as views, so
// a renamed or narrowed field fails the type-check here.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type UserProfileServedAsView = AssertAssignable<UserProfileEntity, ProfileView>;
export type MembershipServedAsView = AssertAssignable<UserMembershipSummary, MembershipView>;
export type PreferencesServedAsView = AssertAssignable<UserPreferencesEntity, PreferencesView>;
export type AvatarTicketServedAsView = AssertAssignable<AvatarUploadTicket, AvatarUploadTicketView>;
