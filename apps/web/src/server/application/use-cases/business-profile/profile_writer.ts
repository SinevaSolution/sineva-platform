import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ConflictError } from '@/server/domain/errors/domain_error';
import { snapshotOf, type ProfileAggregate } from '@/server/domain/business_profile/business_profile';
import { diffSnapshots } from '@/server/domain/business_profile/profile_diff';
import type { BusinessProfileRepository } from '@/server/domain/repositories/business_profile_repository';

import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';

export interface MutateOptions {
  workspace_id: string;
  user_id: string;
  context: RequestContext;
  /** The version the editor started from; a mismatch is a 409. */
  base_version?: number;
  kind?: 'save' | 'restore';
  restored_from?: number;
  /** The one audit event this change produces (FR-ONB auditable events). */
  audit_action: string;
}

export interface MutateResult {
  changed: boolean;
  version: number;
  changed_paths: string[];
  aggregate: ProfileAggregate;
}

/**
 * The only path that changes profile content. It loads the state before,
 * lets the caller apply its change, then bumps the version, freezes a snapshot
 * and writes the audit row, all in one transaction: a version without its
 * audit row, or a change without a version, cannot exist.
 *
 * Why one writer and not each use case doing it: "every save creates a
 * version" has to hold for profile, offers, policies and restore alike, and a
 * copy of this sequence per use case is where one of them would forget.
 */
export class BusinessProfileWriter {
  constructor(
    private readonly repo: BusinessProfileRepository,
    private readonly audit: AuditLogger,
    private readonly transactions: TransactionRunner,
  ) {}

  async mutate(
    options: MutateOptions,
    apply: (repo: BusinessProfileRepository) => Promise<Record<string, unknown> | void>,
  ): Promise<MutateResult> {
    return this.transactions.run(async () => {
      const { workspace_id: workspaceId, user_id: userId } = options;
      const kind = options.kind ?? 'save';

      const before = await this.repo.load(workspaceId);
      const profile = await this.repo.ensureProfile(workspaceId, userId);
      if (options.base_version !== undefined && options.base_version !== profile.version) {
        throw new ConflictError('Business profile version', String(options.base_version));
      }

      const extra = (await apply(this.repo)) ?? {};

      const after = await this.repo.load(workspaceId);
      const changes = diffSnapshots(snapshotOf(before), snapshotOf(after));
      const changedPaths = changes.map((change) => change.path).sort();

      // A save that changes nothing is not a version. A restore always is: it
      // is an explicit act the history should show, even onto equal content.
      if (changes.length === 0 && kind === 'save') {
        return { changed: false, version: profile.version, changed_paths: [], aggregate: after };
      }

      const version = await this.repo.bumpVersion(workspaceId, profile.version, userId);
      await this.repo.insertVersion({
        workspace_id: workspaceId,
        version,
        snapshot: snapshotOf(after),
        changed_paths: changedPaths,
        change_kind: kind,
        restored_from: options.restored_from ?? null,
        changed_by: userId,
      });

      // Paths and ids only: values of the profile never enter the audit log.
      await this.audit.log({
        action: options.audit_action,
        context: options.context,
        workspace_id: workspaceId,
        target_resource_id: workspaceId,
        target_resource_type: 'business_profile',
        metadata: { version, changed_paths: changedPaths, ...extra },
      });

      return { changed: true, version, changed_paths: changedPaths, aggregate: await this.repo.load(workspaceId) };
    });
  }
}
