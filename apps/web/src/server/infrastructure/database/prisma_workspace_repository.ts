import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceRepository,
} from '@/server/domain/repositories/workspace_repository';
import type { WorkspaceEntity, WorkspaceStatus, WorkspaceTier } from '@/server/domain/entities/workspace';
import { activeClient } from './prisma_transaction_runner';

function mapWorkspace(row: {
  id: string;
  workspace_slug: string;
  workspace_name: string;
  owner_user_id: string | null;
  status: string;
  status_reason: string | null;
  trial_ends_at: Date | null;
  timezone: string;
  default_locale: string;
  logo_url: string | null;
  slug_changed_at: Date | null;
  subscription_tier: string;
  monthly_token_quota: number;
  monthly_tokens_consumed: number;
  created_at: Date;
  updated_at: Date;
}): WorkspaceEntity {
  return {
    id: row.id,
    workspace_slug: row.workspace_slug,
    workspace_name: row.workspace_name,
    owner_user_id: row.owner_user_id,
    status: row.status as WorkspaceStatus,
    status_reason: row.status_reason,
    trial_ends_at: row.trial_ends_at?.toISOString() ?? null,
    timezone: row.timezone,
    default_locale: row.default_locale,
    logo_url: row.logo_url,
    slug_changed_at: row.slug_changed_at?.toISOString() ?? null,
    subscription_tier: row.subscription_tier as WorkspaceTier,
    monthly_token_quota: row.monthly_token_quota,
    monthly_tokens_consumed: row.monthly_tokens_consumed,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class PrismaWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<WorkspaceEntity | null> {
    const row = await this.prisma.workspace.findUnique({
      where: { id },
    });
    return row ? mapWorkspace(row) : null;
  }

  async findBySlug(slug: string): Promise<WorkspaceEntity | null> {
    const row = await this.prisma.workspace.findUnique({
      where: { workspace_slug: slug.toLowerCase().trim() },
    });
    return row ? mapWorkspace(row) : null;
  }

  async listForUser(userId: string): Promise<Array<{ workspace: WorkspaceEntity; role: string }>> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { user_id: userId },
      include: { workspace: true },
      orderBy: { created_at: 'asc' },
    });

    return memberships.map((m) => ({
      workspace: mapWorkspace(m.workspace),
      role: m.role,
    }));
  }

  // `create` and `update` read the scoped client so a use case can make the
  // change and its audit row one transaction (see `activeClient`).
  async create(input: CreateWorkspaceInput): Promise<WorkspaceEntity> {
    const row = await activeClient(this.prisma).workspace.create({
      data: {
        workspace_name: input.workspace_name.trim(),
        workspace_slug: input.workspace_slug.toLowerCase().trim(),
        owner_user_id: input.owner_user_id,
        default_locale: input.default_locale ?? 'id',
        timezone: input.timezone ?? 'Asia/Jakarta',
        logo_url: input.logo_url ?? null,
        status: 'active',
        subscription_tier: 'growth',
        monthly_token_quota: 1000000,
        monthly_tokens_consumed: 0,
        members: {
          create: {
            user_id: input.owner_user_id,
            role: 'owner',
            specialist_scope: 'all',
          },
        },
      },
    });

    return mapWorkspace(row);
  }

  async update(id: string, input: UpdateWorkspaceInput): Promise<WorkspaceEntity> {
    const data: Record<string, unknown> = {};
    if (input.workspace_name !== undefined) {
      data.workspace_name = input.workspace_name.trim();
    }
    if (input.workspace_slug !== undefined) {
      data.workspace_slug = input.workspace_slug.toLowerCase().trim();
    }
    if (input.logo_url !== undefined) {
      data.logo_url = input.logo_url;
    }
    if (input.default_locale !== undefined) {
      data.default_locale = input.default_locale;
    }
    if (input.timezone !== undefined) {
      data.timezone = input.timezone;
    }
    if (input.slug_changed_at !== undefined) {
      data.slug_changed_at = input.slug_changed_at;
    }

    const row = await activeClient(this.prisma).workspace.update({
      where: { id },
      data,
    });

    return mapWorkspace(row);
  }

  async slugExists(slug: string): Promise<boolean> {
    const count = await this.prisma.workspace.count({
      where: { workspace_slug: slug.toLowerCase().trim() },
    });
    return count > 0;
  }
}
