import type { StartWorkflowRunDto } from '@/server/application/dtos/workflow_dto';
import { resolveRunInputs } from '@/server/application/workflows/workflow_inputs';
import { emptyBudget, runAudit } from '@/server/application/workflows/workflow_run_support';
import {
  assertValid,
  loadFacts,
  loadWorkflow,
  requireWorkspace,
  specialistsOf,
  type WorkflowDeps,
} from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type { WorkflowRunEntity } from '@/server/domain/workflows/workflow';
import { WorkflowEngineUnavailableError, WorkflowStateError } from '@/server/domain/workflows/workflow_errors';
import type { WorkflowDefinition } from '@/shared/workflows/definition';
import type { TriggerType } from '@/shared/workflows/run_state';

export interface StartRunOptions {
  trigger_type?: TriggerType;
  routine_id?: string | null;
}

export class StartWorkflowRunUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * Starts a test run of the draft or a live run of the published version
   * (FR-WF-20, FR-WF-22). A live run never reads the draft: the version is the
   * only thing it can pin. The definition is validated again here, so a
   * Workflow that needs attention cannot run (FR-WF-27).
   *
   * The row is written before the call so an event that races the answer finds
   * it (ADR-0046 point 6). If sineva-ai cannot be reached nothing ran: the row
   * is removed and the person sees "cannot run yet", never a made-up run.
   */
  async execute(
    workflowId: string,
    dto: StartWorkflowRunDto,
    context: RequestContext,
    options: StartRunOptions = {},
  ): Promise<WorkflowRunEntity> {
    const { deps } = this;
    const workspaceId = requireWorkspace(context);
    const workflow = await loadWorkflow(deps, context, workflowId);
    if (workflow.status === 'archived') {
      throw new WorkflowStateError('workflow_archived', 'An archived Workflow cannot run');
    }

    let definition: WorkflowDefinition;
    let versionId: string | null = null;
    let versionNumber: number | null = null;
    let draftRevision: number | null = null;
    if (dto.mode === 'live') {
      const version = workflow.current_version_id
        ? await deps.versions.findById(workspaceId, workflowId, workflow.current_version_id)
        : null;
      if (!version) throw new WorkflowStateError('not_published', 'Publish the Workflow before running it for real');
      definition = version.definition;
      versionId = version.id;
      versionNumber = version.version_number;
    } else {
      definition = workflow.draft_definition;
      draftRevision = workflow.draft_revision;
    }

    // Strict: a run must not start on a guess about which specialists are on.
    assertValid(definition, await loadFacts(deps, context, { strict: true }));
    const inputs = resolveRunInputs(definition, dto.inputs);

    const engineRunId = deps.newEngineRunId();
    const locale = dto.locale ?? 'id';
    const { token } = await deps.contextSigner.mint(context, {
      run_id: engineRunId,
      budget: emptyBudget(),
      locale,
    });
    const triggerType = options.trigger_type ?? 'manual';
    const run = await deps.runs.create({
      workspace_id: workspaceId,
      workflow_id: workflowId,
      version_id: versionId,
      version_number: versionNumber,
      draft_revision: draftRevision,
      engine_run_id: engineRunId,
      mode: dto.mode,
      started_by: context.user_id,
      trigger_type: triggerType,
      routine_id: options.routine_id ?? null,
      inputs,
      definition,
    });

    let accepted;
    try {
      accepted = await deps.gateway.startRun(
        {
          run_id: engineRunId,
          kind: 'workflow',
          mode: dto.mode,
          workflow_id: workflowId,
          version_number: versionNumber,
          definition,
          definition_revision: draftRevision,
          inputs,
          trigger_type: triggerType,
          routine_id: options.routine_id ?? null,
          locale,
          library_principals: [
            ...new Set(['workspace', `workflow:${workflowId}`, ...specialistsOf(definition).map((slug) => `agent:${slug}`)]),
          ].sort(),
          budget: emptyBudget(),
        },
        { context_token: token, request_id: context.request_id },
      );
    } catch (error) {
      if (error instanceof UpstreamServiceError) {
        // The engine answered but not usably: keep the row so the failure is visible and countable.
        deps.log.warn('workflow.run_start_failed', { workspace_id: workspaceId, run_handle: engineRunId, reason: 'bad_answer', code: error.code });
        const failed = { ...run, status: 'failed' as const };
        await deps.transactions.run(async () => {
          await deps.runs.update(workspaceId, run.id, { status: 'failed', error_code: 'engine_error', finished_at: deps.now().toISOString() });
          await deps.audit.log(runAudit('workflow.run.failed', failed, context, { reason_code: 'engine_error' }));
        });
        throw error;
      }
      // Unreachable (or anything unexpected): nothing ran, so there is no run to keep.
      await deps.runs.delete(workspaceId, run.id);
      if (error instanceof UpstreamUnavailableError) {
        deps.log.warn('workflow.run_start_failed', { workspace_id: workspaceId, run_handle: engineRunId, reason: 'unavailable', code: error.code });
        throw new WorkflowEngineUnavailableError();
      }
      throw error;
    }

    return deps.transactions.run(async () => {
      const started = await deps.runs.update(workspaceId, run.id, {
        status: accepted.status,
        started_at: accepted.status === 'queued' ? null : deps.now().toISOString(),
      });
      await deps.audit.log({
        action: 'workflow.run.started',
        context,
        target_resource_type: 'workflow',
        target_resource_id: workflowId,
        run_id: engineRunId,
        metadata: { mode: dto.mode, trigger_type: triggerType, workflow_run_id: run.id },
      });
      return started;
    });
  }
}
