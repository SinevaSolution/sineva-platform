import type {
  InboxCountsView,
  InboxInputFieldView,
  InboxItemView,
  InboxListView,
  InboxStateView,
  InboxTabView,
} from '@/shared/inbox_view';
import type { GetInboxCountsUseCase } from '../application/use-cases/inbox/get_inbox_counts_use_case';
import type { GetInboxItemUseCase } from '../application/use-cases/inbox/get_inbox_item_use_case';
import type { ListInboxUseCase } from '../application/use-cases/inbox/list_inbox_use_case';
import type { DecideApprovalUseCase } from '../application/use-cases/inbox/decide_approval_use_case';
import type { InboxItemState, InboxTab, InputField } from '../domain/inbox/inbox_item';

// Compile-time drift guard (R-14): what the use cases return and the domain
// enums stay assignable to the views the browser reads.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type InboxItemServedAsView = AssertAssignable<
  Awaited<ReturnType<GetInboxItemUseCase['execute']>>,
  InboxItemView
>;
export type InboxDecisionServedAsView = AssertAssignable<
  Awaited<ReturnType<DecideApprovalUseCase['execute']>>,
  InboxItemView
>;
export type InboxListServedAsView = AssertAssignable<Awaited<ReturnType<ListInboxUseCase['execute']>>, InboxListView>;
export type InboxCountsServedAsView = AssertAssignable<
  Awaited<ReturnType<GetInboxCountsUseCase['execute']>>,
  InboxCountsView
>;
export type InboxTabServedAsView = AssertAssignable<InboxTab, InboxTabView>;
export type InboxStateServedAsView = AssertAssignable<InboxItemState, InboxStateView>;
export type InboxFieldServedAsView = AssertAssignable<InputField, InboxInputFieldView>;
