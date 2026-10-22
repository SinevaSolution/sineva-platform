import 'server-only';
import type { Prisma, PrismaClient } from '@/server/infrastructure/database/generated/client';
import { ConflictError, NotFoundError } from '@/server/domain/errors/domain_error';
import type {
  NewWorkflow,
  NewWorkflowVersion,
  WorkflowDraftPatch,
  WorkflowListFilter,
  WorkflowRepository,
  WorkflowVersionRepository,
} from '@/server/domain/repositories/workflow_repository';
import type {
  WorkflowEntity,
  WorkflowLastRun,
  WorkflowListItem,
  WorkflowStatus,
  WorkflowVersionEntity,
} from '@/server/domain/workflows/workflow';
import type { WorkflowDefinition } from '@/shared/workflows/definition';
import type { RunMode, RunStatus } from '@/shared/workflows/run_state';
import { isUniqueViolation, toJson } from './prisma_json';
import { activeClient } from './prisma_transaction_runner';

type WorkflowRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  draft_definition: Prisma.JsonValue;
  draft_revision: number;
  current_version_id: string | null;
  template_slug: string | null;
  created_by: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapWorkflow(row: WorkflowRow, versionNumber: number | null): WorkflowEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    description: row.description,
    status: row.status as WorkflowStatus,
    draft_definition: row.draft_definition as unknown as WorkflowDefinition,
    draft_revision: row.draft_revision,
    current_version_id: row.current_version_id,
    current_version_number: versionNumber,
    template_slug: row.template_slug,
    created_by: row.created_by,
    archived_at: row.archived_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function mapVersion(row: {
  id: string;
  workflow_id: string;
  workspace_id: string;
  version_number: number;
  definition: Prisma.JsonValue;
  schema_version: number;
  note: string | null;
  restored_from: number | null;
  published_by: string;
  published_at: Date;
}): WorkflowVersionEntity {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    workspace_id: row.workspace_id,
    version_number: row.version_number,
    definition: row.definition as unknown as WorkflowDefinition,
    schema_version: row.schema_version,
    note: row.note,
    restored_from: row.restored_from,
    published_by: row.published_by,
    published_at: row.published_at.toISOString(),
  };
}

export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** `current_version_id` has no foreign key (see the schema), so the number is joined here. */
  private async versionNumbers(ids: Array<string | null>): Promise<Map<string, number>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const rows = await activeClient(this.prisma).workflowVersion.findMany({
      where: { id: { in: wanted } },
      select: { id: true, version_number: true },
    });
    return new Map(rows.map((row) => [row.id, row.version_number]));
  }

  private async hydrate(row: WorkflowRow): Promise<WorkflowEntity> {
    const numbers = await this.versionNumbers([row.current_version_id]);
    return mapWorkflow(row, row.current_version_id ? (numbers.get(row.current_version_id) ?? null) : null);
  }

  async create(input: NewWorkflow): Promise<WorkflowEntity> {
    const row = await activeClient(this.prisma).workflow.create({
      data: {
        workspace_id: input.workspace_id,
        name: input.name,
        description: input.description,
        draft_definition: toJson(input.definition),
        template_slug: input.template_slug,
        created_by: input.created_by,
      },
    });
    return mapWorkflow(row, null);
  }

  async findById(workspaceId: string, id: string): Promise<WorkflowEntity | null> {
    const row = await activeClient(this.prisma).workflow.findFirst({ where: { id, workspace_id: workspaceId } });
    return row ? this.hydrate(row) : null;
  }

  async list(workspaceId: string, filter: WorkflowListFilter): Promise<{ items: WorkflowListItem[]; total: number }> {
    const where: Prisma.WorkflowWhereInput = {
      workspace_id: workspaceId,
      ...(filter.status ? { status: filter.status } : filter.include_archived ? {} : { status: { not: 'archived' } }),
      ...(filter.q ? { name: { contains: filter.q, mode: 'insensitive' } } : {}),
    };
    const client = activeClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.workflow.findMany({
        where,
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        take: filter.limit,
        skip: filter.offset,
      }),
      client.workflow.count({ where }),
    ]);
    const ids = rows.map((row) => row.id);
    // One query for the newest run of each: distinct on the workflow after
    // ordering by recency keeps the first (newest) row per workflow.
    const runs = ids.length
      ? await client.workflowRun.findMany({
          where: { workspace_id: workspaceId, workflow_id: { in: ids } },
          orderBy: [{ workflow_id: 'asc' }, { created_at: 'desc' }, { id: 'desc' }],
          distinct: ['workflow_id'],
          select: { id: true, workflow_id: true, status: true, mode: true, started_at: true, finished_at: true },
        })
      : [];
    const lastByWorkflow = new Map<string, WorkflowLastRun>(
      runs.map((run) => [
        run.workflow_id,
        {
          id: run.id,
          status: run.status as RunStatus,
          mode: run.mode as RunMode,
          started_at: run.started_at?.toISOString() ?? null,
          finished_at: run.finished_at?.toISOString() ?? null,
        },
      ]),
    );
    const numbers = await this.versionNumbers(rows.map((row) => row.current_version_id));
    return {
      items: rows.map((row) => ({
        workflow: mapWorkflow(row, row.current_version_id ? (numbers.get(row.current_version_id) ?? null) : null),
        last_run: lastByWorkflow.get(row.id) ?? null,
      })),
      total,
    };
  }

  async namesByIds(workspaceId: string, ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await activeClient(this.prisma).workflow.findMany({
      where: { workspace_id: workspaceId, id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async countActive(workspaceId: string): Promise<number> {
    return activeClient(this.prisma).workflow.count({
      where: { workspace_id: workspaceId, status: { not: 'archived' } },
    });
  }

  async updateDraft(
    workspaceId: string,
    id: string,
    patch: WorkflowDraftPatch,
    expectedRevision: number,
  ): Promise<WorkflowEntity | null> {
    // One compare-and-set statement: the revision in the WHERE is what makes a
    // stale writer lose instead of overwriting.
    const result = await activeClient(this.prisma).workflow.updateMany({
      where: { id, workspace_id: workspaceId, draft_revision: expectedRevision },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.definition !== undefined
          ? { draft_definition: toJson(patch.definition), draft_revision: { increment: 1 } }
          : {}),
        // `updated_at` does not update itself (known debt), so every write sets it.
        updated_at: new Date(),
      },
    });
    if (result.count === 0) return null;
    return this.findById(workspaceId, id);
  }

  async replaceDraft(workspaceId: string, id: string, definition: WorkflowDefinition): Promise<WorkflowEntity> {
    const result = await activeClient(this.prisma).workflow.updateMany({
      where: { id, workspace_id: workspaceId },
      data: { draft_definition: toJson(definition), draft_revision: { increment: 1 }, updated_at: new Date() },
    });
    return this.requireAfter(result.count, workspaceId, id);
  }

  async markPublished(workspaceId: string, id: string, versionId: string): Promise<WorkflowEntity> {
    const result = await activeClient(this.prisma).workflow.updateMany({
      where: { id, workspace_id: workspaceId },
      data: { status: 'published', current_version_id: versionId, updated_at: new Date() },
    });
    return this.requireAfter(result.count, workspaceId, id);
  }

  async archive(workspaceId: string, id: string, at: Date): Promise<WorkflowEntity> {
    const result = await activeClient(this.prisma).workflow.updateMany({
      where: { id, workspace_id: workspaceId },
      data: { status: 'archived', archived_at: at, updated_at: new Date() },
    });
    return this.requireAfter(result.count, workspaceId, id);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    await activeClient(this.prisma).workflow.deleteMany({ where: { id, workspace_id: workspaceId } });
  }

  private async requireAfter(count: number, workspaceId: string, id: string): Promise<WorkflowEntity> {
    const found = count > 0 ? await this.findById(workspaceId, id) : null;
    if (!found) throw new NotFoundError('Workflow', id);
    return found;
  }
}

export class PrismaWorkflowVersionRepository implements WorkflowVersionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewWorkflowVersion): Promise<WorkflowVersionEntity> {
    const client = activeClient(this.prisma);
    // Two publishes at once would read the same maximum. Locking the workflow
    // row serializes them inside the publish transaction, so the second one
    // reads the first one's number. A retry on the unique index would not work
    // here: a failed statement aborts the whole Postgres transaction. The
    // unique index stays as the backstop for a caller outside a transaction.
    await client.$queryRaw`SELECT id FROM platform.workflows WHERE id = ${input.workflow_id}::uuid FOR UPDATE`;
    const last = await client.workflowVersion.findFirst({
      where: { workflow_id: input.workflow_id },
      orderBy: { version_number: 'desc' },
      select: { version_number: true },
    });
    try {
      const row = await client.workflowVersion.create({
        data: {
          workflow_id: input.workflow_id,
          workspace_id: input.workspace_id,
          version_number: (last?.version_number ?? 0) + 1,
          definition: toJson(input.definition),
          schema_version: input.definition.schema_version,
          note: input.note,
          restored_from: input.restored_from,
          published_by: input.published_by,
        },
      });
      return mapVersion(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('Workflow version', String((last?.version_number ?? 0) + 1));
      throw error;
    }
  }

  async list(workspaceId: string, workflowId: string): Promise<WorkflowVersionEntity[]> {
    const rows = await activeClient(this.prisma).workflowVersion.findMany({
      where: { workspace_id: workspaceId, workflow_id: workflowId },
      orderBy: { version_number: 'desc' },
    });
    return rows.map(mapVersion);
  }

  async findById(workspaceId: string, workflowId: string, id: string): Promise<WorkflowVersionEntity | null> {
    const row = await activeClient(this.prisma).workflowVersion.findFirst({
      where: { id, workspace_id: workspaceId, workflow_id: workflowId },
    });
    return row ? mapVersion(row) : null;
  }
}
