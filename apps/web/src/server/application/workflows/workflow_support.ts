import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import type { EntitlementService } from '@/server/domain/entitlements/entitlements';
import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  UpstreamUnavailableError,
  ValidationError,
} from '@/server/domain/errors/domain_error';
import type {
  WorkflowRepository,
  WorkflowRunRepository,
  WorkflowVersionRepository,
} from '@/server/domain/repositories/workflow_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { WorkflowEntity } from '@/server/domain/workflows/workflow';
import { ENTITLEMENT_KEYS } from '@/server/domain/entitlements/entitlements';
import { WorkflowInvalidError } from '@/server/domain/workflows/workflow_errors';
import type {
  WorkflowCatalog,
  WorkflowLog,
  WorkflowRunGateway,
} from '@/server/domain/workflows/workflow_ports';
import { WORKFLOW_SPECIALISTS, flattenSteps, type WorkflowDefinition } from '@/shared/workflows/definition';
import {
  validateWorkflowDefinition,
  type ValidationContext,
  type WorkflowIssue,
} from '@/shared/workflows/validate';

export interface WorkflowDeps {
  workflows: WorkflowRepository;
  versions: WorkflowVersionRepository;
  runs: WorkflowRunRepository;
  catalog: WorkflowCatalog;
  gateway: WorkflowRunGateway;
  contextSigner: ContextSigner;
  audit: AuditLogger;
  entitlements: EntitlementService;
  transactions: TransactionRunner;
  log: WorkflowLog;
  /** Correlation id sent to sineva-ai (`engine_run_id`). Not a database id. */
  newEngineRunId: () => string;
  now: () => Date;
}

export function requireWorkspace(context: RequestContext): string {
  if (!context.workspace_id) {
    throw new ValidationError('Workspace context is required', [
      { code: 'required', field: 'workspace_id', detail: 'Workspace context is required' },
    ]);
  }
  return context.workspace_id;
}

export function isManager(context: RequestContext): boolean {
  return context.role === 'owner' || context.role === 'admin';
}

export async function loadWorkflow(deps: Pick<WorkflowDeps, 'workflows'>, context: RequestContext, id: string): Promise<WorkflowEntity> {
  const workflow = await deps.workflows.findById(requireWorkspace(context), id);
  if (!workflow) throw new NotFoundError('Workflow', id);
  return workflow;
}

/** A Member edits only drafts they started; Owner and Admin edit any (PRD 10 permissions). */
export function assertCanEdit(workflow: WorkflowEntity, context: RequestContext): void {
  if (isManager(context) || workflow.created_by === context.user_id) return;
  throw new ForbiddenError('Only the owner of this draft or an admin can change it');
}

export interface Facts {
  context: ValidationContext;
  /** False when sineva-ai could not say which specialists are on. */
  catalog_known: boolean;
}

/**
 * What the validator is told about this workspace. `strict` is for actions that
 * must not go ahead on a guess (publish, run): an unreachable sineva-ai
 * propagates as 503. Reading and editing tolerate it and the validator skips
 * the specialist check, because "unknown" is not "off".
 */
export async function loadFacts(
  deps: Pick<WorkflowDeps, 'catalog'>,
  context: RequestContext,
  options: { strict: boolean; generated?: boolean; requested_send?: boolean },
): Promise<Facts> {
  const workspaceId = requireWorkspace(context);
  let enabled: string[] | null;
  try {
    enabled = await deps.catalog.enabledSpecialists(context);
  } catch (error) {
    if (!options.strict && error instanceof UpstreamUnavailableError) {
      enabled = null;
    } else {
      throw error;
    }
  }
  const [connections, actions] = await Promise.all([deps.catalog.connections(workspaceId), deps.catalog.actions()]);
  return {
    catalog_known: enabled !== null,
    context: {
      enabled_specialists: enabled,
      connections,
      actions,
      // Whoever publishes is an Admin or Owner, and an editor sees the same
      // message the publisher would: only managers may raise the cap.
      can_raise_loop_cap: isManager(context),
      generated: options.generated ?? false,
      requested_send: options.requested_send ?? false,
    },
  };
}

export function issuesOf(definition: unknown, facts: Facts): WorkflowIssue[] {
  return validateWorkflowDefinition(definition, facts.context).issues;
}

/** Throws `WorkflowInvalidError` when the definition cannot be published or run. */
export function assertValid(definition: unknown, facts: Facts): void {
  const issues = issuesOf(definition, facts);
  if (issues.length > 0) throw new WorkflowInvalidError(issues);
}

export function stepCountOf(definition: WorkflowDefinition): number {
  return Array.isArray(definition?.steps) ? flattenSteps(definition.steps).length : 0;
}

/** Distinct wave 1 specialists a definition uses, in step order. */
export function specialistsOf(definition: WorkflowDefinition): string[] {
  if (!Array.isArray(definition?.steps)) return [];
  const found: string[] = [];
  for (const step of flattenSteps(definition.steps)) {
    if (
      (step.type === 'specialist_task' || step.type === 'skill') &&
      (WORKFLOW_SPECIALISTS as readonly string[]).includes(step.specialist) &&
      !found.includes(step.specialist)
    ) {
      found.push(step.specialist);
    }
  }
  return found;
}

/** Same as the Library: a typed `DomainError` is the caller's to handle, anything else is a bug. */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Creates a draft: plan limit first (FR-BILL-34), then the row and its audit
 * event together. Blank creation and "use a template" both come through here.
 */
export async function createDraft(
  deps: WorkflowDeps,
  context: RequestContext,
  input: { name: string; description: string | null; definition: WorkflowDefinition; template_slug: string | null },
): Promise<WorkflowEntity> {
  const workspaceId = requireWorkspace(context);
  const count = await deps.workflows.countActive(workspaceId);
  await deps.entitlements.assert(workspaceId, ENTITLEMENT_KEYS.WORKFLOWS, count + 1);
  return deps.transactions.run(async () => {
    const workflow = await deps.workflows.create({
      workspace_id: workspaceId,
      name: input.name,
      description: input.description,
      definition: input.definition,
      template_slug: input.template_slug,
      created_by: context.user_id,
    });
    await deps.audit.log({
      action: 'workflow.created',
      context,
      target_resource_type: 'workflow',
      target_resource_id: workflow.id,
      metadata: {
        step_count: stepCountOf(input.definition),
        ...(input.template_slug ? { template_slug: input.template_slug } : {}),
      },
    });
    return workflow;
  });
}
