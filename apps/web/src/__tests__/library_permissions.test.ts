import { describe, expect, it } from 'vitest';
import type { UserRole } from '@/server/domain/entities/user';
import {
  C2_PERMISSION_MATRIX_FIXTURE,
  hasPermission,
  type PermissionKey,
} from '@/server/domain/permissions/registry';

// PRD "Sino Library", Permissions table. `library.sources.manage` is M2.
const EXPECTED: Record<string, UserRole[]> = {
  'library.read': ['owner', 'admin', 'member', 'viewer'],
  'library.upload': ['owner', 'admin', 'member'],
  'library.manage': ['owner', 'admin'],
  'library.delete': ['owner', 'admin'],
  'library.usage.view': ['owner', 'admin'],
};

describe('Library permission keys are registered with the PRD default roles', () => {
  for (const [key, roles] of Object.entries(EXPECTED)) {
    for (const role of ['owner', 'admin', 'member', 'viewer'] as UserRole[]) {
      it(`${key} for ${role} is ${roles.includes(role) ? 'allowed' : 'denied'}`, () => {
        expect(hasPermission(role, key as PermissionKey).allowed).toBe(roles.includes(role));
      });
    }
  }

  it('does not register library.sources.manage before sources exist', () => {
    expect(Object.keys(C2_PERMISSION_MATRIX_FIXTURE)).not.toContain('library.sources.manage');
  });
});
