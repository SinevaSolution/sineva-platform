import type { EntitlementService } from '@/server/domain/entitlements/entitlements';

// Stand-in for `open` mode in tests that are about something else.
export const allowAllEntitlements: EntitlementService = {
  check: async () => ({ allowed: true, reason: 'open_mode' }),
  assert: async () => undefined,
  numericLimit: async () => null,
};
