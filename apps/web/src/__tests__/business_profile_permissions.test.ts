import { describe, expect, it } from 'vitest';
import {
  C2_PERMISSION_MATRIX_FIXTURE,
  hasPermission,
  type PermissionKey,
} from '@/server/domain/permissions/registry';
import type { UserRole } from '@/server/domain/entities/user';

// PRD "Onboarding, Business Profile & Memory" section 5, permissions table.
// The PRD calls the keys profile.view / profile.update / profile.scan; those
// names already belong to the person's own profile, so the business keys carry
// a prefix (ADR-0031 decision 5).
const EXPECTED: Record<string, Record<UserRole, boolean>> = {
  'business_profile.view': { owner: true, admin: true, member: true, viewer: true },
  'business_profile.update': { owner: true, admin: true, member: false, viewer: false },
  'business_profile.scan': { owner: true, admin: true, member: false, viewer: false },
  'onboarding.run': { owner: true, admin: false, member: false, viewer: false },
};

describe('business profile and onboarding permission matrix (WP-M1-35, WP-M1-36)', () => {
  for (const [key, roles] of Object.entries(EXPECTED)) {
    for (const [role, allowed] of Object.entries(roles) as Array<[UserRole, boolean]>) {
      it(`${key}: ${role} ${allowed ? 'may' : 'may not'}`, () => {
        expect(hasPermission(role, key as PermissionKey).allowed).toBe(allowed);
      });
    }
  }

  it('leaves the own-profile keys untouched: a viewer still edits only their own account profile', () => {
    expect(C2_PERMISSION_MATRIX_FIXTURE['profile.update'].viewer).toBe('yes');
  });
});
