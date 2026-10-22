import type {
  WorkflowCatalogView,
  WorkflowDetailView,
  WorkflowRunDetailView,
  WorkflowRunView,
  WorkflowTemplateView,
  WorkflowVersionView,
  WorkflowView,
} from '@/shared/workflows/workflow_view';
import type { GetWorkflowCatalogUseCase } from '../application/use-cases/workflows/get_workflow_catalog_use_case';
import type { ListWorkflowTemplatesUseCase } from '../application/use-cases/workflows/list_workflow_templates_use_case';
import type {
  toWorkflowDetailView,
  toWorkflowRunDetailView,
  toWorkflowRunView,
  toWorkflowVersionView,
  toWorkflowView,
} from './workflow_view';

// Compile-time drift guard: what the server produces must stay assignable to
// what the browser is typed to read.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type WorkflowServedAsView = AssertAssignable<ReturnType<typeof toWorkflowView>, WorkflowView>;
export type WorkflowDetailServedAsView = AssertAssignable<ReturnType<typeof toWorkflowDetailView>, WorkflowDetailView>;
export type WorkflowVersionServedAsView = AssertAssignable<ReturnType<typeof toWorkflowVersionView>, WorkflowVersionView>;
export type WorkflowRunServedAsView = AssertAssignable<ReturnType<typeof toWorkflowRunView>, WorkflowRunView>;
export type WorkflowRunDetailServedAsView = AssertAssignable<
  ReturnType<typeof toWorkflowRunDetailView>,
  WorkflowRunDetailView
>;
export type WorkflowTemplatesServedAsView = AssertAssignable<
  Awaited<ReturnType<ListWorkflowTemplatesUseCase['execute']>>,
  WorkflowTemplateView[]
>;
export type WorkflowCatalogServedAsView = AssertAssignable<
  Awaited<ReturnType<GetWorkflowCatalogUseCase['execute']>>,
  WorkflowCatalogView
>;
