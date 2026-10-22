import {
  EntitlementRequiredError,
  isEntitlementKey,
  type EntitlementCheckResult,
  type EntitlementKey,
  type EntitlementLimitProvider,
  type EntitlementMode,
  type EntitlementService,
} from '@/server/domain/entitlements/entitlements';

export type EntitlementEventSink = (event: Record<string, unknown>) => void;

// The mode decides only what a failed check does (block, log, ignore); the
// decision itself is computed identically in every mode, so switching to
// `enforced` is configuration, not a retrofit. In `open` mode the provider is
// not consulted: nothing can fail, and M0 has no plans to consult.
export class ModeEntitlementService implements EntitlementService {
  constructor(
    private readonly mode: EntitlementMode,
    private readonly limits: EntitlementLimitProvider,
    private readonly sink: EntitlementEventSink,
  ) {}

  async check(
    workspaceId: string | null,
    key: EntitlementKey,
    quantity?: number,
  ): Promise<EntitlementCheckResult> {
    if (!isEntitlementKey(key)) {
      // Fails in every mode so a typo is caught in `open` mode, long before
      // enforcement would turn it into a customer-facing block.
      throw new Error(`Unknown entitlement key: ${String(key)}`);
    }

    if (this.mode === 'open') {
      this.emit('entitlement.checked', workspaceId, key, quantity, true, 'open_mode');
      return { allowed: true, reason: 'open_mode' };
    }

    const decision = await this.decide(workspaceId, key, quantity);

    if (this.mode === 'shadow') {
      this.emit(
        decision.allowed ? 'entitlement.checked' : 'entitlement.would_block',
        workspaceId,
        key,
        quantity,
        decision.allowed,
        decision.reason,
        decision.plan_required,
      );
      return { ...decision, allowed: true };
    }

    this.emit('entitlement.checked', workspaceId, key, quantity, decision.allowed, decision.reason, decision.plan_required);
    return decision;
  }

  async assert(workspaceId: string | null, key: EntitlementKey, quantity?: number): Promise<void> {
    const result = await this.check(workspaceId, key, quantity);
    if (!result.allowed) {
      throw new EntitlementRequiredError(key, result.plan_required);
    }
  }

  private async decide(
    workspaceId: string | null,
    key: EntitlementKey,
    quantity?: number,
  ): Promise<EntitlementCheckResult> {
    const entry = await this.limits.resolve(workspaceId, key);
    const planRequired = entry?.plan_required;
    const withPlan = planRequired ? { plan_required: planRequired } : {};

    if (!entry) {
      return { allowed: false, reason: 'no_entitlement' };
    }
    if (typeof entry.limit === 'boolean') {
      return entry.limit
        ? { allowed: true, reason: 'feature_enabled' }
        : { allowed: false, reason: 'feature_disabled', ...withPlan };
    }
    if (quantity === undefined || quantity <= entry.limit) {
      return { allowed: true, reason: 'within_limit' };
    }
    return { allowed: false, reason: 'limit_exceeded', ...withPlan };
  }

  // Ids, key names and counts only; never personal data (logs hold no content).
  private emit(
    event: string,
    workspaceId: string | null,
    key: EntitlementKey,
    quantity: number | undefined,
    allowed: boolean,
    reason: string,
    planRequired?: string,
  ): void {
    this.sink({
      event,
      mode: this.mode,
      workspace_id: workspaceId,
      key,
      ...(quantity !== undefined ? { quantity } : {}),
      allowed,
      reason,
      ...(planRequired ? { plan_required: planRequired } : {}),
    });
  }
}
