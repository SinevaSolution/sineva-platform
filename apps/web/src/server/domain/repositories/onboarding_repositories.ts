import type { DismissedTask } from '@/server/domain/onboarding/first_task_catalog';
import type {
  ChecklistItemKey,
  OnboardingAnswers,
  OnboardingFlow,
  OnboardingStateEntity,
  OnboardingStatus,
} from '@/server/domain/onboarding/onboarding';
import type { ProfileScanEntity, ScanResult, ScanStatus } from '@/server/domain/onboarding/profile_scan';

export interface CreateOnboardingStateInput {
  workspace_id: string;
  user_id: string;
  flow: OnboardingFlow;
  current_step: number;
  answers: OnboardingAnswers;
  skipped_steps: number[];
}

export interface UpdateOnboardingStateInput {
  status?: OnboardingStatus;
  current_step?: number;
  answers?: OnboardingAnswers;
  skipped_steps?: number[];
  dismissed_tasks?: DismissedTask[];
  completed_at?: string | null;
}

export interface OnboardingStateRepository {
  find(workspaceId: string, userId: string): Promise<OnboardingStateEntity | null>;
  /** @throws ConflictError when a row for (workspace, user) already exists. */
  create(input: CreateOnboardingStateInput): Promise<OnboardingStateEntity>;
  update(workspaceId: string, userId: string, input: UpdateOnboardingStateInput): Promise<OnboardingStateEntity>;
}

export interface CreateScanInput {
  workspace_id: string;
  requested_by: string;
  url: string;
  now: Date;
  limit: number;
  window_ms: number;
  ttl_ms: number;
}

export type CreateScanOutcome =
  | { limited: false; scan: ProfileScanEntity }
  | { limited: true; retry_after_seconds: number };

export interface ScanOutcomeInput {
  status: ScanStatus;
  result: ScanResult | null;
  error_code: string | null;
}

export interface ProfileScanRepository {
  /**
   * Counts the requests of the workspace in the rolling window and inserts the
   * new `running` row in one step, serialized per workspace, so concurrent
   * requests cannot overshoot the limit. Deleted rows count; rows that
   * never reached the fetcher do not (see `UNCOUNTED_SCAN_ERRORS`).
   */
  createIfUnderLimit(input: CreateScanInput): Promise<CreateScanOutcome>;
  /** Excludes soft-deleted rows. */
  findById(workspaceId: string, id: string): Promise<ProfileScanEntity | null>;
  /** Null when the row is gone (deleted while the call was in flight). */
  recordOutcome(workspaceId: string, id: string, input: ScanOutcomeInput): Promise<ProfileScanEntity | null>;
  /** Soft delete: the row still counts toward the quota but its result is dropped. */
  discard(workspaceId: string, id: string): Promise<boolean>;
  /** Blanks the result of rows past `expires_at` for the workspace. */
  purgeExpired(workspaceId: string, now: Date): Promise<number>;
}

export interface ChecklistRepository {
  /** Items with a stored completion. */
  listDone(workspaceId: string): Promise<Array<{ item_key: ChecklistItemKey; completed_at: string }>>;
  /** Idempotent: a second call for the same item keeps the first completion. */
  markDone(workspaceId: string, itemKey: ChecklistItemKey, source: string): Promise<void>;
}

export interface InvitationReader {
  /** A not yet accepted, not yet expired invitation addressed to this email. */
  hasPendingForEmail(email: string, now: Date): Promise<boolean>;
  hasAcceptedInvitation(workspaceId: string): Promise<boolean>;
}
