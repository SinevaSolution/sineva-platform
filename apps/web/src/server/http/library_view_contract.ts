import type {
  LibraryDocumentView,
  LibraryFolderView,
  LibraryKnowledgeView,
  LibraryPreviewView,
  LibrarySummaryView,
  LibraryTryResultView,
  LibraryUploadTicketView,
  LibraryUsageView,
} from '@/shared/library_view';
import type { LibraryKnowledge } from '../application/use-cases/library/get_library_knowledge_use_case';
import type { LibrarySummary } from '../application/use-cases/library/get_library_summary_use_case';
import type { LibraryPreview } from '../application/use-cases/library/preview_library_document_use_case';
import type { LibraryUploadTicket } from '../application/use-cases/library/request_library_upload_use_case';
import type { LibraryTryResult } from '../application/use-cases/library/try_library_retrieval_use_case';
import type { LibraryUsageView as ServerUsage } from '../application/use-cases/library/get_library_usage_use_case';
import type { toLibraryDocumentView, toLibraryFolderView } from './library_view';

// Compile-time drift guard: what the server produces must stay assignable to
// what the browser is typed to read.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type LibraryDocumentServedAsView = AssertAssignable<
  ReturnType<typeof toLibraryDocumentView>,
  LibraryDocumentView
>;
export type LibraryFolderServedAsView = AssertAssignable<ReturnType<typeof toLibraryFolderView>, LibraryFolderView>;
export type LibraryUploadTicketServedAsView = AssertAssignable<LibraryUploadTicket, LibraryUploadTicketView>;
export type LibraryUsageServedAsView = AssertAssignable<ServerUsage, LibraryUsageView>;
export type LibrarySummaryServedAsView = AssertAssignable<LibrarySummary, LibrarySummaryView>;
export type LibraryKnowledgeServedAsView = AssertAssignable<LibraryKnowledge, LibraryKnowledgeView>;
export type LibraryTryResultServedAsView = AssertAssignable<LibraryTryResult, LibraryTryResultView>;
export type LibraryPreviewServedAsView = AssertAssignable<LibraryPreview, LibraryPreviewView>;
