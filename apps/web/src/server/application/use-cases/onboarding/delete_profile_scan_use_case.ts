import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { ProfileScanRepository } from '@/server/domain/repositories/onboarding_repositories';

export class DeleteProfileScanUseCase {
  constructor(private readonly deps: { scans: ProfileScanRepository }) {}

  /** Drops the suggestions. The request still counts toward the hourly quota. */
  async execute(input: { workspace_id: string; scan_id: string }): Promise<void> {
    if (!(await this.deps.scans.discard(input.workspace_id, input.scan_id))) {
      throw new NotFoundError('Profile scan', input.scan_id);
    }
  }
}
