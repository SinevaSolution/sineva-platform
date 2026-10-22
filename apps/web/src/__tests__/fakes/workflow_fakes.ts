import { NotFoundError, UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type { RequestContext } from '@/server/domain/context/request_context';
import type {
  NewWorkflow,
  NewWorkflowRun,
  NewWorkflowVersion,
  WorkflowDraftPatch,
  WorkflowListFilter,
  WorkflowRepository,
  WorkflowRunFilter,
  WorkflowRunRepository,
  WorkflowVersionRepository,
} from '@/server/domain/repositories/workflow_repository';
import type {
  RunPatch,
  StepPatch,
  WorkflowEntity,
  WorkflowLastRun,
  WorkflowListItem,
  WorkflowRunEntity,
  WorkflowRunStepEntity,
  WorkflowVersionEntity,
} from '@/server/domain/workflows/workflow';
import type {
  ResumeMode,
  RunAccepted,
  RunSnapshot,
  StartRunRequest,
  WorkflowCatalog,
  WorkflowConnection,
  WorkflowLog,
  WorkflowLogEvent,
  WorkflowLogFields,
  WorkflowRunCall,
  WorkflowRunGateway,
} from '@/server/domain/workflows/workflow_ports';
import type { WorkflowDefinition } from '@/shared/workflows/definition';
import type { ActionMeta } from '@/shared/workflows/validate';

let counter = 0;
/** Valid v4-shaped ids so the same values pass Zod uuid checks in route tests. */
export function nextId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

const iso = (date: Date = new Date()) => date.toISOString();

export class InMemoryWorkflows implements WorkflowRepository {
  readonly rows = new Map<string, WorkflowEntity>();
  /** Set by the harness so `current_version_number` can be joined like the adapter does. */
  versions: InMemoryWorkflowVersions | null = null;

  async create(input: NewWorkflow): Promise<WorkflowEntity> {
    const now = iso();
    const row: WorkflowEntity = {
      id: nextId(),
      workspace_id: input.workspace_id,
      name: input.name,
      description: input.description,
      status: 'draft',
      draft_definition: structuredClone(input.definition),
      draft_revision: 1,
      current_version_id: null,
      current_version_number: null,
      template_slug: input.template_slug,
      created_by: input.created_by,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(row.id, row);
    return structuredClone(row);
  }

  async findById(workspaceId: string, id: string): Promise<WorkflowEntity | null> {
    const row = this.rows.get(id);
    return row && row.workspace_id === workspaceId ? structuredClone(row) : null;
  }

  runs: InMemoryWorkflowRuns | null = null;

  async list(workspaceId: string, filter: WorkflowListFilter): Promise<{ items: WorkflowListItem[]; total: number }> {
    const matching = [...this.rows.values()]
      .filter((row) => row.workspace_id === workspaceId)
      .filter((row) => (filter.status ? row.status === filter.status : filter.include_archived || row.status !== 'archived'))
      .filter((row) => !filter.q || row.name.toLowerCase().includes(filter.q.toLowerCase()))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id));
    const items = matching.slice(filter.offset, filter.offset + filter.limit).map((row) => ({
      workflow: structuredClone(row),
      last_run: this.runs?.lastRunOf(row.id) ?? null,
    }));
    return { items, total: matching.length };
  }

  async namesByIds(workspaceId: string, ids: readonly string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row && row.workspace_id === workspaceId) names.set(id, row.name);
    }
    return names;
  }

  async countActive(workspaceId: string): Promise<number> {
    return [...this.rows.values()].filter((row) => row.workspace_id === workspaceId && row.status !== 'archived').length;
  }

  async updateDraft(
    workspaceId: string,
    id: string,
    patch: WorkflowDraftPatch,
    expectedRevision: number,
  ): Promise<WorkflowEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId || row.draft_revision !== expectedRevision) return null;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.definition !== undefined) {
      row.draft_definition = structuredClone(patch.definition);
      row.draft_revision += 1;
    }
    row.updated_at = iso();
    return structuredClone(row);
  }

  async replaceDraft(workspaceId: string, id: string, definition: WorkflowDefinition): Promise<WorkflowEntity> {
    const row = this.mustGet(workspaceId, id);
    row.draft_definition = structuredClone(definition);
    row.draft_revision += 1;
    row.updated_at = iso();
    return structuredClone(row);
  }

  async markPublished(workspaceId: string, id: string, versionId: string): Promise<WorkflowEntity> {
    const row = this.mustGet(workspaceId, id);
    row.status = 'published';
    row.current_version_id = versionId;
    row.current_version_number = this.versions?.numberOf(versionId) ?? null;
    row.updated_at = iso();
    return structuredClone(row);
  }

  async archive(workspaceId: string, id: string, at: Date): Promise<WorkflowEntity> {
    const row = this.mustGet(workspaceId, id);
    row.status = 'archived';
    row.archived_at = iso(at);
    row.updated_at = iso();
    return structuredClone(row);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    this.mustGet(workspaceId, id);
    this.rows.delete(id);
  }

  private mustGet(workspaceId: string, id: string): WorkflowEntity {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) throw new NotFoundError('Workflow', id);
    return row;
  }
}

export class InMemoryWorkflowVersions implements WorkflowVersionRepository {
  readonly rows: WorkflowVersionEntity[] = [];

  async create(input: NewWorkflowVersion): Promise<WorkflowVersionEntity> {
    const number = this.rows.filter((row) => row.workflow_id === input.workflow_id).length + 1;
    const row: WorkflowVersionEntity = {
      id: nextId(),
      workflow_id: input.workflow_id,
      workspace_id: input.workspace_id,
      version_number: number,
      definition: structuredClone(input.definition),
      schema_version: input.definition.schema_version,
      note: input.note,
      restored_from: input.restored_from,
      published_by: input.published_by,
      published_at: iso(),
    };
    this.rows.push(row);
    return structuredClone(row);
  }

  async list(workspaceId: string, workflowId: string): Promise<WorkflowVersionEntity[]> {
    return this.rows
      .filter((row) => row.workspace_id === workspaceId && row.workflow_id === workflowId)
      .sort((a, b) => b.version_number - a.version_number)
      .map((row) => structuredClone(row));
  }

  async findById(workspaceId: string, workflowId: string, id: string): Promise<WorkflowVersionEntity | null> {
    const row = this.rows.find((r) => r.id === id && r.workspace_id === workspaceId && r.workflow_id === workflowId);
    return row ? structuredClone(row) : null;
  }

  numberOf(id: string): number | null {
    return this.rows.find((row) => row.id === id)?.version_number ?? null;
  }
}

export class InMemoryWorkflowRuns implements WorkflowRunRepository {
  readonly rows = new Map<string, WorkflowRunEntity>();
  readonly steps = new Map<string, WorkflowRunStepEntity>();
  readonly events: Array<{ run_id: string; event_id: string; sequence: number; type: string; applied: boolean }> = [];

  async create(input: NewWorkflowRun): Promise<WorkflowRunEntity> {
    const now = iso();
    const row: WorkflowRunEntity = {
      id: nextId(),
      workspace_id: input.workspace_id,
      workflow_id: input.workflow_id,
      version_id: input.version_id,
      version_number: input.version_number,
      draft_revision: input.draft_revision,
      engine_run_id: input.engine_run_id,
      mode: input.mode,
      status: 'queued',
      started_by: input.started_by,
      trigger_type: input.trigger_type,
      routine_id: input.routine_id,
      inputs: structuredClone(input.inputs),
      definition: structuredClone(input.definition),
      credits_estimated: null,
      credits_used: 0,
      error_code: null,
      last_event_seq: 0,
      started_at: null,
      finished_at: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(row.id, row);
    return structuredClone(row);
  }

  async findById(workspaceId: string, id: string): Promise<WorkflowRunEntity | null> {
    const row = this.rows.get(id);
    return row && row.workspace_id === workspaceId ? structuredClone(row) : null;
  }

  async findByEngineRunId(engineRunId: string): Promise<WorkflowRunEntity | null> {
    const row = [...this.rows.values()].find((r) => r.engine_run_id === engineRunId);
    return row ? structuredClone(row) : null;
  }

  async list(workspaceId: string, filter: WorkflowRunFilter): Promise<{ items: WorkflowRunEntity[]; total: number }> {
    const matching = [...this.rows.values()]
      .filter((row) => row.workspace_id === workspaceId)
      .filter((row) => !filter.workflow_id || row.workflow_id === filter.workflow_id)
      .filter((row) => !filter.status || row.status === filter.status)
      .filter((row) => !filter.mode || row.mode === filter.mode)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    return {
      items: matching.slice(filter.offset, filter.offset + filter.limit).map((row) => structuredClone(row)),
      total: matching.length,
    };
  }

  async update(workspaceId: string, id: string, patch: RunPatch): Promise<WorkflowRunEntity> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) throw new NotFoundError('Workflow run', id);
    Object.assign(row, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    row.updated_at = iso();
    return structuredClone(row);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.workspace_id === workspaceId) this.rows.delete(id);
  }

  async hasRuns(workspaceId: string, workflowId: string): Promise<boolean> {
    return [...this.rows.values()].some((row) => row.workspace_id === workspaceId && row.workflow_id === workflowId);
  }

  async hasSucceededTest(workspaceId: string, workflowId: string, draftRevision: number): Promise<boolean> {
    return [...this.rows.values()].some(
      (row) =>
        row.workspace_id === workspaceId &&
        row.workflow_id === workflowId &&
        row.mode === 'test' &&
        row.status === 'succeeded' &&
        row.draft_revision === draftRevision,
    );
  }

  async advanceSequence(workspaceId: string, id: string, sequence: number): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId || row.last_event_seq >= sequence) return false;
    row.last_event_seq = sequence;
    return true;
  }

  async upsertStep(workspaceId: string, runId: string, patch: StepPatch): Promise<WorkflowRunStepEntity> {
    const key = `${runId}:${patch.step_key}`;
    const existing = this.steps.get(key);
    const next: WorkflowRunStepEntity = {
      id: existing?.id ?? nextId(),
      run_id: runId,
      workspace_id: workspaceId,
      step_key: patch.step_key,
      position: patch.position,
      step_type: patch.step_type,
      status: patch.status,
      attempt: patch.attempt ?? existing?.attempt ?? 1,
      progress_current: patch.progress === undefined ? (existing?.progress_current ?? null) : (patch.progress?.current ?? null),
      progress_total: patch.progress === undefined ? (existing?.progress_total ?? null) : (patch.progress?.total ?? null),
      output_preview: patch.output_preview === undefined ? (existing?.output_preview ?? null) : patch.output_preview,
      trace: patch.trace === undefined ? (existing?.trace ?? null) : patch.trace,
      error_code: patch.error_code === undefined ? (existing?.error_code ?? null) : patch.error_code,
      credits: patch.credits ?? existing?.credits ?? 0,
      approval_id: patch.approval_id === undefined ? (existing?.approval_id ?? null) : patch.approval_id,
      started_at: patch.started_at === undefined ? (existing?.started_at ?? null) : patch.started_at,
      finished_at: patch.finished_at === undefined ? (existing?.finished_at ?? null) : patch.finished_at,
    };
    this.steps.set(key, next);
    return structuredClone(next);
  }

  async listSteps(workspaceId: string, runId: string): Promise<WorkflowRunStepEntity[]> {
    return [...this.steps.values()]
      .filter((step) => step.run_id === runId && step.workspace_id === workspaceId)
      .sort((a, b) => a.position - b.position)
      .map((step) => structuredClone(step));
  }

  async recordEvent(input: {
    run_id: string;
    event_id: string;
    sequence: number;
    type: string;
    applied: boolean;
  }): Promise<{ inserted: boolean }> {
    if (this.events.some((event) => event.run_id === input.run_id && event.event_id === input.event_id)) {
      return { inserted: false };
    }
    this.events.push({ run_id: input.run_id, event_id: input.event_id, sequence: input.sequence, type: input.type, applied: input.applied });
    return { inserted: true };
  }

  lastRunOf(workflowId: string): WorkflowLastRun | null {
    const newest = [...this.rows.values()]
      .filter((row) => row.workflow_id === workflowId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    return newest
      ? { id: newest.id, status: newest.status, mode: newest.mode, started_at: newest.started_at, finished_at: newest.finished_at }
      : null;
  }
}

/** Answers what the proposed contract fixtures say, and records each call. A test overrides one method to fail it. */
export class FakeWorkflowRunGateway implements WorkflowRunGateway {
  readonly started: Array<{ request: StartRunRequest; call: WorkflowRunCall }> = [];
  readonly cancelled: string[] = [];
  readonly resumed: Array<{ run_id: string; mode: ResumeMode; key: string }> = [];
  /** What `getRun` answers, keyed by engine run id; absent means "not found" as a 502. */
  snapshots = new Map<string, RunSnapshot>();
  failWith: 'unavailable' | 'bad_answer' | null = null;
  /** Status the engine reports after accepting a start. */
  acceptedStatus: RunAccepted['status'] = 'queued';

  private maybeFail(): void {
    if (this.failWith === 'unavailable') throw new UpstreamUnavailableError('down', 'workflow_engine_unavailable');
    if (this.failWith === 'bad_answer') throw new UpstreamServiceError('bad', 'UPSTREAM_ERROR', 502);
  }

  async startRun(request: StartRunRequest, call: WorkflowRunCall): Promise<RunAccepted> {
    this.maybeFail();
    this.started.push({ request, call });
    return { run_id: request.run_id, status: this.acceptedStatus };
  }

  async getRun(engineRunId: string): Promise<RunSnapshot> {
    this.maybeFail();
    const snapshot = this.snapshots.get(engineRunId);
    if (!snapshot) throw new UpstreamServiceError('unknown run', 'UPSTREAM_ERROR', 502);
    return snapshot;
  }

  async cancelRun(engineRunId: string): Promise<RunAccepted> {
    this.maybeFail();
    this.cancelled.push(engineRunId);
    return { run_id: engineRunId, status: 'cancelled' };
  }

  async resumeRun(engineRunId: string, body: { mode: ResumeMode }, key: string): Promise<RunAccepted> {
    this.maybeFail();
    this.resumed.push({ run_id: engineRunId, mode: body.mode, key });
    return { run_id: engineRunId, status: 'running' };
  }
}

export class FakeWorkflowCatalog implements WorkflowCatalog {
  specialists: string[] | null = ['sinopeople', 'sinofinance', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights'];
  unreachable = false;
  connectionList: WorkflowConnection[] = [];
  actionMap: Record<string, ActionMeta> = {};

  async enabledSpecialists(context: RequestContext): Promise<string[] | null> {
    void context;
    if (this.unreachable) throw new UpstreamUnavailableError('down', 'KNOWLEDGE_UNAVAILABLE');
    return this.specialists;
  }
  async connections(): Promise<WorkflowConnection[]> {
    return this.connectionList;
  }
  async actions(): Promise<Record<string, ActionMeta>> {
    return this.actionMap;
  }
}

export class FakeWorkflowLog implements WorkflowLog {
  readonly warnings: Array<{ event: WorkflowLogEvent; fields: WorkflowLogFields }> = [];
  warn(event: WorkflowLogEvent, fields: WorkflowLogFields): void {
    this.warnings.push({ event, fields });
  }
}
