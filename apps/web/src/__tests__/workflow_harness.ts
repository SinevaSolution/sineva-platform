import type { WorkflowDeps } from '@/server/application/workflows/workflow_support';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { EntitlementKey } from '@/server/domain/entitlements/entitlements';
import type { WorkflowEntity } from '@/server/domain/workflows/workflow';
import { emptyDefinition, type WorkflowDefinition } from '@/shared/workflows/definition';
import { FakeTransactionRunner } from './fakes/fake_transaction_runner';
import { FakeContextSigner, RecordingEntitlements } from './fakes/library_fakes';
import {
  FakeWorkflowCatalog,
  FakeWorkflowLog,
  FakeWorkflowRunGateway,
  InMemoryWorkflowRuns,
  InMemoryWorkflowVersions,
  InMemoryWorkflows,
} from './fakes/workflow_fakes';

export const WS = '11111111-1111-4111-8111-111111111111';
export const OTHER_WS = '22222222-2222-4222-8222-222222222222';
export const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const MEMBER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const OTHER_MEMBER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const NOW = new Date('2026-10-23T09:00:00.000Z');

export function ctx(extra: Partial<RequestContext> = {}): RequestContext {
  return {
    user_id: ADMIN,
    workspace_id: WS,
    session_id: 'sess-1',
    request_id: 'req-1',
    role: 'admin',
    specialist_scope: 'all',
    actor: { type: 'user', id: ADMIN },
    ...extra,
  };
}
export const memberCtx = (userId = MEMBER) => ctx({ user_id: userId, role: 'member', actor: { type: 'user', id: userId } });
export const ownerCtx = () => ctx({ role: 'owner' });

/** One specialist step: valid with no apps connected, so most tests need no registry. */
export function simpleDefinition(extra: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    ...emptyDefinition(),
    inputs: [{ key: 'days', type: 'number', label: 'Days', required: true, default: 7 }],
    steps: [
      {
        key: 'summary',
        type: 'specialist_task',
        title: 'Summarize',
        specialist: 'sinofinance',
        instruction: 'Summarize the last {{inputs.days}} days.',
        output_type: 'text',
      },
    ],
    ...extra,
  };
}

export interface WorkflowHarness {
  deps: WorkflowDeps;
  workflows: InMemoryWorkflows;
  versions: InMemoryWorkflowVersions;
  runs: InMemoryWorkflowRuns;
  gateway: FakeWorkflowRunGateway;
  catalog: FakeWorkflowCatalog;
  signer: FakeContextSigner;
  audit: CountingAuditLogger;
  entitlements: RecordingEntitlements;
  transactions: FakeTransactionRunner;
  log: FakeWorkflowLog;
}

export function buildWorkflowHarness(options: { denied?: EntitlementKey[] } = {}): WorkflowHarness {
  const workflows = new InMemoryWorkflows();
  const versions = new InMemoryWorkflowVersions();
  const runs = new InMemoryWorkflowRuns();
  workflows.versions = versions;
  workflows.runs = runs;
  const gateway = new FakeWorkflowRunGateway();
  const catalog = new FakeWorkflowCatalog();
  const signer = new FakeContextSigner();
  const audit = new CountingAuditLogger();
  const entitlements = new RecordingEntitlements(new Set(options.denied ?? []));
  const transactions = new FakeTransactionRunner();
  const log = new FakeWorkflowLog();
  let counter = 0;
  const deps: WorkflowDeps = {
    workflows,
    versions,
    runs,
    catalog,
    gateway,
    contextSigner: signer,
    audit,
    entitlements,
    transactions,
    log,
    newEngineRunId: () => `60000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    now: () => NOW,
  };
  return { deps, workflows, versions, runs, gateway, catalog, signer, audit, entitlements, transactions, log };
}

/** A workflow created through the repository, as an admin's draft. */
export async function seedWorkflow(
  h: WorkflowHarness,
  extra: { name?: string; definition?: WorkflowDefinition; created_by?: string; workspace_id?: string } = {},
): Promise<WorkflowEntity> {
  return h.workflows.create({
    workspace_id: extra.workspace_id ?? WS,
    name: extra.name ?? 'Penagihan',
    description: null,
    definition: extra.definition ?? simpleDefinition(),
    template_slug: null,
    created_by: extra.created_by ?? ADMIN,
  });
}

/** Makes the publish gate pass: a succeeded test run on the draft's current revision. */
export async function passTestRun(h: WorkflowHarness, workflow: WorkflowEntity): Promise<void> {
  const run = await h.runs.create({
    workspace_id: workflow.workspace_id,
    workflow_id: workflow.id,
    version_id: null,
    version_number: null,
    draft_revision: workflow.draft_revision,
    engine_run_id: `70000000-0000-4000-8000-${String(h.runs.rows.size + 1).padStart(12, '0')}`,
    mode: 'test',
    started_by: ADMIN,
    trigger_type: 'manual',
    routine_id: null,
    inputs: {},
    definition: workflow.draft_definition,
  });
  await h.runs.update(workflow.workspace_id, run.id, { status: 'succeeded' });
}
