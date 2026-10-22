import { ConflictError } from '@/server/domain/errors/domain_error';
import type { OnboardingStateEntity, ChecklistItemKey } from '@/server/domain/onboarding/onboarding';
import { UNCOUNTED_SCAN_ERRORS, type ProfileScanEntity, type ScanResult } from '@/server/domain/onboarding/profile_scan';
import type {
  ChecklistRepository,
  CreateOnboardingStateInput,
  CreateScanInput,
  CreateScanOutcome,
  InvitationReader,
  OnboardingStateRepository,
  ProfileScanRepository,
  ScanOutcomeInput,
  UpdateOnboardingStateInput,
} from '@/server/domain/repositories/onboarding_repositories';
import type { WebsiteScanCall, WebsiteScanGateway } from '@/server/domain/repositories/website_scan_gateway';

export class InMemoryOnboardingStateRepository implements OnboardingStateRepository {
  rows = new Map<string, OnboardingStateEntity>();
  private key = (w: string, u: string) => `${w}:${u}`;

  async find(workspaceId: string, userId: string) {
    return this.rows.get(this.key(workspaceId, userId)) ?? null;
  }

  async create(input: CreateOnboardingStateInput): Promise<OnboardingStateEntity> {
    const key = this.key(input.workspace_id, input.user_id);
    if (this.rows.has(key)) throw new ConflictError('Onboarding state', key);
    const row: OnboardingStateEntity = {
      id: `onb-${this.rows.size + 1}`,
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      flow: input.flow,
      status: 'in_progress',
      current_step: input.current_step,
      answers: input.answers,
      skipped_steps: input.skipped_steps,
      dismissed_tasks: [],
      started_at: new Date().toISOString(),
      completed_at: null,
      persisted: true,
    };
    this.rows.set(key, row);
    return row;
  }

  async update(workspaceId: string, userId: string, input: UpdateOnboardingStateInput) {
    const key = this.key(workspaceId, userId);
    const current = this.rows.get(key);
    if (!current) throw new Error('no such onboarding state');
    const next = { ...current, ...input } as OnboardingStateEntity;
    this.rows.set(key, next);
    return next;
  }
}

export class InMemoryProfileScanRepository implements ProfileScanRepository {
  rows: Array<ProfileScanEntity & { deleted: boolean }> = [];
  private seq = 0;

  async createIfUnderLimit(input: CreateScanInput): Promise<CreateScanOutcome> {
    const since = input.now.getTime() - input.window_ms;
    const counted = this.rows.filter(
      (r) =>
        r.workspace_id === input.workspace_id &&
        Date.parse(r.created_at) > since &&
        !(r.error_code && UNCOUNTED_SCAN_ERRORS.includes(r.error_code)),
    );
    if (counted.length >= input.limit) {
      const oldest = Math.min(...counted.map((r) => Date.parse(r.created_at)));
      return { limited: true, retry_after_seconds: Math.max(1, Math.ceil((oldest + input.window_ms - input.now.getTime()) / 1000)) };
    }
    this.seq += 1;
    const scan: ProfileScanEntity & { deleted: boolean } = {
      id: `scan-${this.seq}`,
      workspace_id: input.workspace_id,
      requested_by: input.requested_by,
      url: input.url,
      status: 'running',
      result: null,
      error_code: null,
      created_at: input.now.toISOString(),
      expires_at: new Date(input.now.getTime() + input.ttl_ms).toISOString(),
      deleted: false,
    };
    this.rows.push(scan);
    return { limited: false, scan };
  }

  async findById(workspaceId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.workspace_id === workspaceId && !r.deleted) ?? null;
  }

  async recordOutcome(workspaceId: string, id: string, input: ScanOutcomeInput) {
    const row = this.rows.find((r) => r.id === id && r.workspace_id === workspaceId && !r.deleted);
    if (!row) return null;
    Object.assign(row, { status: input.status, result: input.result, error_code: input.error_code });
    return row;
  }

  async discard(workspaceId: string, id: string): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id && r.workspace_id === workspaceId && !r.deleted);
    if (!row) return false;
    row.deleted = true;
    row.result = null;
    return true;
  }

  async purgeExpired(workspaceId: string, now: Date): Promise<number> {
    let n = 0;
    for (const r of this.rows) {
      if (r.workspace_id === workspaceId && Date.parse(r.expires_at) <= now.getTime() && r.result !== null) {
        r.result = null;
        n += 1;
      }
    }
    return n;
  }
}

export class InMemoryChecklistRepository implements ChecklistRepository {
  done = new Map<string, { item_key: ChecklistItemKey; completed_at: string; source: string; workspace_id: string }>();

  async listDone(workspaceId: string) {
    return [...this.done.values()]
      .filter((d) => d.workspace_id === workspaceId)
      .map((d) => ({ item_key: d.item_key, completed_at: d.completed_at }));
  }

  async markDone(workspaceId: string, itemKey: ChecklistItemKey, source: string) {
    const key = `${workspaceId}:${itemKey}`;
    if (!this.done.has(key)) {
      this.done.set(key, { workspace_id: workspaceId, item_key: itemKey, completed_at: new Date().toISOString(), source });
    }
  }
}

export class FakeInvitationReader implements InvitationReader {
  pendingEmails = new Set<string>();
  acceptedWorkspaces = new Set<string>();

  async hasPendingForEmail(email: string) {
    return this.pendingEmails.has(email.toLowerCase());
  }

  async hasAcceptedInvitation(workspaceId: string) {
    return this.acceptedWorkspaces.has(workspaceId);
  }
}

export class FakeWebsiteScanGateway implements WebsiteScanGateway {
  calls: WebsiteScanCall[] = [];
  next: ScanResult | Error | null = null;

  async scan(call: WebsiteScanCall): Promise<ScanResult> {
    this.calls.push(call);
    if (this.next instanceof Error) throw this.next;
    if (this.next) return this.next;
    throw new Error('FakeWebsiteScanGateway: set `next` first');
  }
}
