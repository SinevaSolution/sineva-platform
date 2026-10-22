import type { MeResult } from '@/server/application/use-cases/profile/get_me_use_case';
import type { MeView } from '@/shared/profile_view';

/** `GET` and `PATCH /api/v1/me` body: the profile fields with the memberships next to them. */
export function toMeView({ profile, memberships }: MeResult): MeView {
  return { ...profile, memberships };
}
