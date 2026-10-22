import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { ProfileScanEntity } from '@/server/domain/onboarding/profile_scan';
import type { ProfileScanRepository } from '@/server/domain/repositories/onboarding_repositories';

// A scan is held open for the length of one request (sineva-ai caps at 20 s).
// A row still `running` well past that lost its request (a restart, a dropped
// connection), so it is reported as failed instead of spinning forever.
const STALE_RUNNING_MS = 60_000;

export class GetProfileScanUseCase {
  constructor(private readonly deps: { scans: ProfileScanRepository; now: () => Date }) {}

  async execute(input: { workspace_id: string; scan_id: string }): Promise<ProfileScanEntity> {
    const now = this.deps.now();
    const scan = await this.deps.scans.findById(input.workspace_id, input.scan_id);
    if (!scan) {
      throw new NotFoundError('Profile scan', input.scan_id);
    }
    // Results expire after 24 hours: read as gone, and blanked so they do not linger.
    if (Date.parse(scan.expires_at) <= now.getTime()) {
      await this.deps.scans.purgeExpired(input.workspace_id, now);
      throw new NotFoundError('Profile scan', input.scan_id);
    }
    if (
      (scan.status === 'running' || scan.status === 'queued') &&
      now.getTime() - Date.parse(scan.created_at) > STALE_RUNNING_MS
    ) {
      const failed = await this.deps.scans.recordOutcome(input.workspace_id, scan.id, {
        status: 'failed',
        result: null,
        error_code: 'scan_timeout',
      });
      return failed ?? scan;
    }
    return scan;
  }
}
