import type { ProfileView } from '@/shared/profile_view';
import type { UserProfileEntity } from '../domain/entities/user_profile';

// Compile-time drift guard, same approach as `agent_view_contract.ts`: the
// profile route serialises `UserProfileEntity` and the client types it as
// `ProfileView`, so a renamed or narrowed field fails the type-check here.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type UserProfileServedAsView = AssertAssignable<UserProfileEntity, ProfileView>;
