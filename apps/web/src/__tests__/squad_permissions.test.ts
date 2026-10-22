import { describe, expect, it } from 'vitest';
import { C2_PERMISSION_MATRIX_FIXTURE, hasPermission } from '@/server/domain/permissions/registry';

// Default roles of the Squads PRD permission table (WP-M4-05 task 8).
const EXPECTED = {
  'squad.read': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'squad.create': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  // A Member edits only squads they created: `limited`, finished by the use case.
  'squad.edit': { owner: 'yes', admin: 'yes', member: 'limited', viewer: 'no' },
  'squad.chat': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'squad.memory.edit': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'squad.access.override': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'squad.delete': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
} as const;

describe('squad permission keys (FR-AUTH-33)', () => {
  it('registers all seven keys with the PRD default roles', () => {
    for (const [key, roles] of Object.entries(EXPECTED)) {
      expect(C2_PERMISSION_MATRIX_FIXTURE[key as keyof typeof C2_PERMISSION_MATRIX_FIXTURE]).toEqual(roles);
    }
  });

  it('lets a Viewer read squads but never chat, create, edit or delete', () => {
    expect(hasPermission('viewer', 'squad.read').allowed).toBe(true);
    for (const key of ['squad.chat', 'squad.create', 'squad.edit', 'squad.delete', 'squad.access.override'] as const) {
      expect(hasPermission('viewer', key).allowed).toBe(false);
    }
  });

  it('allows a Member to edit only their own squads when the policy has the facts', () => {
    expect(hasPermission('member', 'squad.edit', { actorUserId: 'u1', targetUserId: 'u1', actorRole: 'member' }).allowed).toBe(true);
    expect(hasPermission('member', 'squad.edit', { actorUserId: 'u1', targetUserId: 'u2', actorRole: 'member' }).allowed).toBe(false);
    // Without the target the guard is a coarse gate; the use case repeats the check.
    expect(hasPermission('member', 'squad.edit').allowed).toBe(true);
  });

  it('keeps Owner and Admin unrestricted on squad.edit', () => {
    expect(hasPermission('admin', 'squad.edit', { actorUserId: 'u1', targetUserId: 'u2', actorRole: 'admin' }).allowed).toBe(true);
  });
});
