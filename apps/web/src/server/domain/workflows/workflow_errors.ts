import { DomainError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type { WorkflowIssue } from '@/shared/workflows/validate';

// Machine codes the Workflow screens map to copy; the messages are for logs.

/** The definition has issues that stop this action (publish, run). Details carry the issue codes. */
export class WorkflowInvalidError extends DomainError {
  constructor(public readonly issues: WorkflowIssue[]) {
    const details = issues.slice(0, 20).map((issue) => ({
      code: issue.code,
      field: issue.path || null,
      detail: issue.step_key ?? '',
    }));
    super({
      message: 'The Workflow has problems that must be fixed first',
      code: 'workflow_invalid',
      status: 422,
      details,
    });
    this.name = 'WorkflowInvalidError';
  }
}

export type WorkflowConflictCode =
  | 'test_run_required'
  | 'workflow_archived'
  | 'not_published'
  | 'workflow_has_runs'
  | 'run_not_resumable'
  | 'run_not_active'
  | 'version_not_found';

/** The action is fine but the Workflow or run is in a state that does not allow it. */
export class WorkflowStateError extends DomainError {
  constructor(code: WorkflowConflictCode, message: string) {
    super({ message, code, status: 409 });
    this.name = 'WorkflowStateError';
  }
}

/** Someone else saved the draft first. The current revision lets the builder offer a reload. */
export class DraftConflictError extends DomainError {
  constructor(public readonly currentRevision: number) {
    super({
      message: 'The draft changed since it was loaded',
      code: 'draft_conflict',
      status: 409,
      details: [{ code: 'draft_conflict', field: 'expected_revision', detail: String(currentRevision) }],
    });
    this.name = 'DraftConflictError';
  }
}

/** sineva-ai did not answer a start, cancel or resume: nothing ran (ADR-0046 point 6). */
export class WorkflowEngineUnavailableError extends UpstreamUnavailableError {
  constructor() {
    super('The Workflow engine is unavailable', 'workflow_engine_unavailable');
    this.name = 'WorkflowEngineUnavailableError';
  }
}
