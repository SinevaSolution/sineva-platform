import 'server-only';
import type { Prisma, PrismaClient } from '@/server/infrastructure/database/generated/client';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type {
  NewWorkflowRun,
  WorkflowRunFilter,
  WorkflowRunRepository,
} from '@/server/domain/repositories/workflow_repository';
import type {
  RunPatch,
  StepPatch,
  WorkflowRunEntity,
  WorkflowRunStepEntity,
} from '@/server/domain/workflows/workflow';
import type { WorkflowDefinition } from '@/shared/workflows/definition';
import type { RunMode, RunStatus, StepStatus, TriggerType } from '@/shared/workflows/run_state';
import { toJson, toNullableJson } from './prisma_json';
import { activeClient } from './prisma_transaction_runner';

type RunRow = {
  id: string;
  workspace_id: string;
  workflow_id: string;
  version_id: string | null;
  version_number: number | null;
  draft_revision: number | null;
  engine_run_id: string;
  mode: string;
  status: string;
  started_by: string;
  trigger_type: string;
  routine_id: string | null;
  inputs: Prisma.JsonValue;
  definition: Prisma.JsonValue;
  credits_estimated: number | null;
  credits_used: number;
  error_code: string | null;
  last_event_seq: number;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapRun(row: RunRow): WorkflowRunEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    workflow_id: row.workflow_id,
    version_id: row.version_id,
    version_number: row.version_number,
    draft_revision: row.draft_revision,
    engine_run_id: row.engine_run_id,
    mode: row.mode as RunMode,
    status: row.status as RunStatus,
    started_by: row.started_by,
    trigger_type: row.trigger_type as TriggerType,
    routine_id: row.routine_id,
    inputs: (row.inputs ?? {}) as Record<string, unknown>,
    definition: row.definition as unknown as WorkflowDefinition,
    credits_estimated: row.credits_estimated,
    credits_used: row.credits_used,
    error_code: row.error_code,
    last_event_seq: row.last_event_seq,
    started_at: row.started_at?.toISOString() ?? null,
    finished_at: row.finished_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

type StepRow = {
  id: string;
  run_id: string;
  workspace_id: string;
  step_key: string;
  position: number;
  step_type: string;
  status: string;
  attempt: number;
  progress_current: number | null;
  progress_total: number | null;
  output_preview: string | null;
  trace: Prisma.JsonValue | null;
  error_code: string | null;
  credits: number;
  approval_id: string | null;
  started_at: Date | null;
  finished_at: Date | null;
};

function mapStep(row: StepRow): WorkflowRunStepEntity {
  return {
    id: row.id,
    run_id: row.run_id,
    workspace_id: row.workspace_id,
    step_key: row.step_key,
    position: row.position,
    step_type: row.step_type,
    status: row.status as StepStatus,
    attempt: row.attempt,
    progress_current: row.progress_current,
    progress_total: row.progress_total,
    output_preview: row.output_preview,
    trace: row.trace,
    error_code: row.error_code,
    credits: row.credits,
    approval_id: row.approval_id,
    started_at: row.started_at?.toISOString() ?? null,
    finished_at: row.finished_at?.toISOString() ?? null,
  };
}

const toDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined ? undefined : value === null ? null : new Date(value);

export class PrismaWorkflowRunRepository implements WorkflowRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewWorkflowRun): Promise<WorkflowRunEntity> {
    const row = await activeClient(this.prisma).workflowRun.create({
      data: {
        workspace_id: input.workspace_id,
        workflow_id: input.workflow_id,
        version_id: input.version_id,
        version_number: input.version_number,
        draft_revision: input.draft_revision,
        engine_run_id: input.engine_run_id,
        mode: input.mode,
        started_by: input.started_by,
        trigger_type: input.trigger_type,
        routine_id: input.routine_id,
        inputs: toJson(input.inputs),
        definition: toJson(input.definition),
      },
    });
    return mapRun(row);
  }

  async findById(workspaceId: string, id: string): Promise<WorkflowRunEntity | null> {
    const row = await activeClient(this.prisma).workflowRun.findFirst({ where: { id, workspace_id: workspaceId } });
    return row ? mapRun(row) : null;
  }

  async findByEngineRunId(engineRunId: string): Promise<WorkflowRunEntity | null> {
    const row = await activeClient(this.prisma).workflowRun.findUnique({ where: { engine_run_id: engineRunId } });
    return row ? mapRun(row) : null;
  }

  async list(workspaceId: string, filter: WorkflowRunFilter): Promise<{ items: WorkflowRunEntity[]; total: number }> {
    const where: Prisma.WorkflowRunWhereInput = {
      workspace_id: workspaceId,
      ...(filter.workflow_id ? { workflow_id: filter.workflow_id } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mode ? { mode: filter.mode } : {}),
    };
    const client = activeClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.workflowRun.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: filter.limit,
        skip: filter.offset,
      }),
      client.workflowRun.count({ where }),
    ]);
    return { items: rows.map(mapRun), total };
  }

  async update(workspaceId: string, id: string, patch: RunPatch): Promise<WorkflowRunEntity> {
    const result = await activeClient(this.prisma).workflowRun.updateMany({
      where: { id, workspace_id: workspaceId },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.credits_used !== undefined ? { credits_used: patch.credits_used } : {}),
        ...(patch.credits_estimated !== undefined ? { credits_estimated: patch.credits_estimated } : {}),
        ...(patch.error_code !== undefined ? { error_code: patch.error_code } : {}),
        ...(patch.started_at !== undefined ? { started_at: toDate(patch.started_at) } : {}),
        ...(patch.finished_at !== undefined ? { finished_at: toDate(patch.finished_at) } : {}),
        // `updated_at` does not update itself (known debt), so every write sets it.
        updated_at: new Date(),
      },
    });
    const row = result.count > 0 ? await this.findById(workspaceId, id) : null;
    if (!row) throw new NotFoundError('Workflow run', id);
    return row;
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    await activeClient(this.prisma).workflowRun.deleteMany({ where: { id, workspace_id: workspaceId } });
  }

  async hasRuns(workspaceId: string, workflowId: string): Promise<boolean> {
    const row = await activeClient(this.prisma).workflowRun.findFirst({
      where: { workspace_id: workspaceId, workflow_id: workflowId },
      select: { id: true },
    });
    return row !== null;
  }

  async hasSucceededTest(workspaceId: string, workflowId: string, draftRevision: number): Promise<boolean> {
    const row = await activeClient(this.prisma).workflowRun.findFirst({
      where: {
        workspace_id: workspaceId,
        workflow_id: workflowId,
        mode: 'test',
        status: 'succeeded',
        draft_revision: draftRevision,
      },
      select: { id: true },
    });
    return row !== null;
  }

  async advanceSequence(workspaceId: string, id: string, sequence: number): Promise<boolean> {
    // The WHERE is the compare: only a strictly higher sequence moves it.
    const result = await activeClient(this.prisma).workflowRun.updateMany({
      where: { id, workspace_id: workspaceId, last_event_seq: { lt: sequence } },
      data: { last_event_seq: sequence, updated_at: new Date() },
    });
    return result.count > 0;
  }

  async upsertStep(workspaceId: string, runId: string, patch: StepPatch): Promise<WorkflowRunStepEntity> {
    const data = {
      position: patch.position,
      step_type: patch.step_type,
      status: patch.status,
      ...(patch.attempt !== undefined ? { attempt: patch.attempt } : {}),
      ...(patch.progress !== undefined
        ? { progress_current: patch.progress?.current ?? null, progress_total: patch.progress?.total ?? null }
        : {}),
      ...(patch.output_preview !== undefined ? { output_preview: patch.output_preview } : {}),
      ...(patch.trace !== undefined ? { trace: toNullableJson(patch.trace) } : {}),
      ...(patch.error_code !== undefined ? { error_code: patch.error_code } : {}),
      ...(patch.credits !== undefined ? { credits: patch.credits } : {}),
      ...(patch.approval_id !== undefined ? { approval_id: patch.approval_id } : {}),
      ...(patch.started_at !== undefined ? { started_at: toDate(patch.started_at) } : {}),
      ...(patch.finished_at !== undefined ? { finished_at: toDate(patch.finished_at) } : {}),
      updated_at: new Date(),
    };
    const row = await activeClient(this.prisma).workflowRunStep.upsert({
      where: { run_id_step_key: { run_id: runId, step_key: patch.step_key } },
      create: { run_id: runId, workspace_id: workspaceId, step_key: patch.step_key, ...data },
      update: data,
    });
    return mapStep(row);
  }

  async listSteps(workspaceId: string, runId: string): Promise<WorkflowRunStepEntity[]> {
    const rows = await activeClient(this.prisma).workflowRunStep.findMany({
      where: { run_id: runId, workspace_id: workspaceId },
      orderBy: [{ position: 'asc' }, { step_key: 'asc' }],
    });
    return rows.map(mapStep);
  }

  async recordEvent(input: {
    workspace_id: string;
    run_id: string;
    event_id: string;
    sequence: number;
    type: string;
    applied: boolean;
  }): Promise<{ inserted: boolean }> {
    // `createMany` with skipDuplicates is ON CONFLICT DO NOTHING: a retried
    // callback is a quiet no-op, and it must not abort the surrounding
    // transaction the way a caught unique violation would.
    const result = await activeClient(this.prisma).workflowRunEvent.createMany({
      data: [input],
      skipDuplicates: true,
    });
    return { inserted: result.count > 0 };
  }
}
