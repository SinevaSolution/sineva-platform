import 'server-only';
import { Prisma, type PrismaClient } from './generated/client';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type { DismissedTask } from '@/server/domain/onboarding/first_task_catalog';
import type {
  ChecklistItemKey,
  OnboardingAnswers,
  OnboardingFlow,
  OnboardingStateEntity,
  OnboardingStatus,
} from '@/server/domain/onboarding/onboarding';
import {
  UNCOUNTED_SCAN_ERRORS,
  type ProfileScanEntity,
  type ScanResult,
  type ScanStatus,
} from '@/server/domain/onboarding/profile_scan';
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
import { isUniqueViolation, toJson, toNullableJson } from './prisma_json';
import { activeClient } from './prisma_transaction_runner';

type StateRow = Prisma.OnboardingStateGetPayload<object>;
type ScanRow = Prisma.ProfileScanGetPayload<object>;

function mapState(row: StateRow): OnboardingStateEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    flow: row.flow as OnboardingFlow,
    status: row.status as OnboardingStatus,
    current_step: row.current_step,
    answers: (row.answers as OnboardingAnswers) ?? {},
    skipped_steps: (row.skipped_steps as number[]) ?? [],
    dismissed_tasks: (row.dismissed_tasks as unknown as DismissedTask[]) ?? [],
    started_at: row.started_at.toISOString(),
    completed_at: row.completed_at ? row.completed_at.toISOString() : null,
    persisted: true,
  };
}

export class PrismaOnboardingStateRepository implements OnboardingStateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): Prisma.TransactionClient {
    return activeClient(this.prisma);
  }

  async find(workspaceId: string, userId: string): Promise<OnboardingStateEntity | null> {
    const row = await this.db.onboardingState.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
    });
    return row ? mapState(row) : null;
  }

  async create(input: CreateOnboardingStateInput): Promise<OnboardingStateEntity> {
    try {
      const row = await this.db.onboardingState.create({
        data: {
          workspace_id: input.workspace_id,
          user_id: input.user_id,
          flow: input.flow,
          current_step: input.current_step,
          answers: toJson(input.answers),
          skipped_steps: toJson(input.skipped_steps),
        },
      });
      return mapState(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Onboarding state', `${input.workspace_id}:${input.user_id}`);
      }
      throw error;
    }
  }

  async update(workspaceId: string, userId: string, input: UpdateOnboardingStateInput): Promise<OnboardingStateEntity> {
    const row = await this.db.onboardingState.update({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
      data: {
        status: input.status,
        current_step: input.current_step,
        answers: input.answers === undefined ? undefined : toJson(input.answers),
        skipped_steps: input.skipped_steps === undefined ? undefined : toJson(input.skipped_steps),
        dismissed_tasks: input.dismissed_tasks === undefined ? undefined : toJson(input.dismissed_tasks),
        completed_at: input.completed_at === undefined ? undefined : input.completed_at === null ? null : new Date(input.completed_at),
      },
    });
    return mapState(row);
  }
}

function mapScan(row: ScanRow): ProfileScanEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    requested_by: row.requested_by,
    url: row.url,
    status: row.status as ScanStatus,
    result: (row.result as ScanResult | null) ?? null,
    error_code: row.error_code,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
  };
}

export class PrismaProfileScanRepository implements ProfileScanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): Prisma.TransactionClient {
    return activeClient(this.prisma);
  }

  async createIfUnderLimit(input: CreateScanInput): Promise<CreateScanOutcome> {
    // Its own transaction on the base client: the advisory lock lives exactly as
    // long as the count-then-insert, so two requests of one workspace queue up
    // here and the second sees the first one's row. Without the lock both read
    // "4 of 5" and both insert.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.workspace_id}, 0))`;

      const since = new Date(input.now.getTime() - input.window_ms);
      const counted = await tx.profileScan.findMany({
        where: {
          workspace_id: input.workspace_id,
          created_at: { gt: since },
          // Deleted rows count on purpose; a scan that never reached sineva-ai does not.
          OR: [{ error_code: null }, { error_code: { notIn: [...UNCOUNTED_SCAN_ERRORS] } }],
        },
        orderBy: { created_at: 'asc' },
        select: { created_at: true },
      });

      if (counted.length >= input.limit) {
        const oldest = counted[0].created_at.getTime();
        return {
          limited: true as const,
          retry_after_seconds: Math.max(1, Math.ceil((oldest + input.window_ms - input.now.getTime()) / 1000)),
        };
      }

      const row = await tx.profileScan.create({
        data: {
          workspace_id: input.workspace_id,
          requested_by: input.requested_by,
          url: input.url,
          status: 'running',
          created_at: input.now,
          expires_at: new Date(input.now.getTime() + input.ttl_ms),
        },
      });
      return { limited: false as const, scan: mapScan(row) };
    });
  }

  async findById(workspaceId: string, id: string): Promise<ProfileScanEntity | null> {
    const row = await this.db.profileScan.findFirst({ where: { id, workspace_id: workspaceId, deleted_at: null } });
    return row ? mapScan(row) : null;
  }

  async recordOutcome(workspaceId: string, id: string, input: ScanOutcomeInput): Promise<ProfileScanEntity | null> {
    const result = await this.db.profileScan.updateMany({
      where: { id, workspace_id: workspaceId, deleted_at: null },
      data: {
        status: input.status,
        result: toNullableJson(input.result),
        error_code: input.error_code,
        updated_at: new Date(),
      },
    });
    if (result.count === 0) return null;
    return this.findById(workspaceId, id);
  }

  async discard(workspaceId: string, id: string): Promise<boolean> {
    const result = await this.db.profileScan.updateMany({
      where: { id, workspace_id: workspaceId, deleted_at: null },
      data: { deleted_at: new Date(), result: Prisma.DbNull, updated_at: new Date() },
    });
    return result.count > 0;
  }

  async purgeExpired(workspaceId: string, now: Date): Promise<number> {
    const result = await this.db.profileScan.updateMany({
      where: { workspace_id: workspaceId, expires_at: { lte: now }, result: { not: Prisma.DbNull } },
      data: { result: Prisma.DbNull, updated_at: new Date() },
    });
    return result.count;
  }
}

export class PrismaChecklistRepository implements ChecklistRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): Prisma.TransactionClient {
    return activeClient(this.prisma);
  }

  async listDone(workspaceId: string): Promise<Array<{ item_key: ChecklistItemKey; completed_at: string }>> {
    const rows = await this.db.workspaceChecklistState.findMany({
      where: { workspace_id: workspaceId, status: 'done' },
    });
    return rows.map((row) => ({ item_key: row.item_key as ChecklistItemKey, completed_at: row.completed_at.toISOString() }));
  }

  async markDone(workspaceId: string, itemKey: ChecklistItemKey, source: string): Promise<void> {
    // `update: {}` keeps the first completion time when the event fires twice.
    await this.db.workspaceChecklistState.upsert({
      where: { workspace_id_item_key: { workspace_id: workspaceId, item_key: itemKey } },
      create: { workspace_id: workspaceId, item_key: itemKey, status: 'done', source },
      update: {},
    });
  }
}

export class PrismaInvitationReader implements InvitationReader {
  constructor(private readonly prisma: PrismaClient) {}

  async hasPendingForEmail(email: string, now: Date): Promise<boolean> {
    const row = await this.prisma.workspaceInvitation.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, accepted_at: null, expires_at: { gt: now } },
      select: { id: true },
    });
    return row !== null;
  }

  async hasAcceptedInvitation(workspaceId: string): Promise<boolean> {
    const row = await this.prisma.workspaceInvitation.findFirst({
      where: { workspace_id: workspaceId, accepted_at: { not: null } },
      select: { id: true },
    });
    return row !== null;
  }
}
