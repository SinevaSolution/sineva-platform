import { DomainError } from '@/server/domain/errors/domain_error';

// Constants so later work packages reference keys, never strings. Names follow
// the billing PRD's FR-BILL-15 where it names a key; `workspaces.owned.max`
// is the key the plan-gated extra-workspace rule needs and
// `library.ocr_pages.monthly` covers the monthly OCR quota. Values and the
// plan mapping are not defined here: that is the plan catalog's job.
export const ENTITLEMENT_KEYS = {
  MEMBERS: 'members.max',
  WORKSPACES: 'workspaces.owned.max',
  STORAGE_MB: 'library.storage_mb',
  DOCUMENTS: 'library.documents.max',
  OCR_PAGES: 'library.ocr_pages.monthly',
  SPECIALISTS_WAVE2: 'specialists.wave2',
  CONNECTIONS: 'connections.max',
  ROUTINES: 'routines.max',
  WORKFLOWS: 'workflows.max',
  SQUADS: 'squads.enabled',
} as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[keyof typeof ENTITLEMENT_KEYS];

const KEY_SET: ReadonlySet<string> = new Set(Object.values(ENTITLEMENT_KEYS));

export function isEntitlementKey(value: string): value is EntitlementKey {
  return KEY_SET.has(value);
}

/**
 * `open`: everything allowed, checks logged. `shadow`: same for users, but a
 * check that would fail is logged as `entitlement.would_block`. `enforced`:
 * a failing check blocks.
 */
export type EntitlementMode = 'open' | 'shadow' | 'enforced';
export const ENTITLEMENT_MODES: readonly EntitlementMode[] = ['open', 'shadow', 'enforced'];

/** A number is a ceiling for the requested quantity; a boolean is an on/off feature. */
export interface EntitlementLimit {
  limit: number | boolean;
  plan_required?: string;
}

/**
 * Where limits come from. M0 has no plans, so the shipped provider resolves
 * nothing; the per-workspace override (read from the workspace record) and
 * the plan catalog plug in here in M4 without touching callers.
 */
export interface EntitlementLimitProvider {
  /** `workspaceId` is null for account-level keys checked before a workspace exists. */
  resolve(workspaceId: string | null, key: EntitlementKey): Promise<EntitlementLimit | null>;
}

export interface EntitlementCheckResult {
  allowed: boolean;
  reason: string;
  plan_required?: string;
}

export interface EntitlementService {
  check(
    workspaceId: string | null,
    key: EntitlementKey,
    quantity?: number,
  ): Promise<EntitlementCheckResult>;
  /** Resolves when the action may proceed; throws `EntitlementRequiredError` when blocked. */
  assert(workspaceId: string | null, key: EntitlementKey, quantity?: number): Promise<void>;
  /**
   * The ceiling of a counted entitlement, for screens that show "used of
   * limit". Null when there is none to show: `open` mode, an unknown key, or a
   * feature flag. Purely informational; it never blocks and is not logged.
   */
  numericLimit(workspaceId: string | null, key: EntitlementKey): Promise<number | null>;
}

export class EntitlementRequiredError extends DomainError {
  constructor(
    public readonly key: EntitlementKey,
    public readonly plan_required?: string,
  ) {
    super({
      message: `This action needs a plan that includes '${key}'`,
      code: 'entitlement_required',
      status: 403,
      field: null,
    });
    this.name = 'EntitlementRequiredError';
  }
}
