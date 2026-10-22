import { monthStart, requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ENTITLEMENT_KEYS } from '@/server/domain/entitlements/entitlements';

const MB = 1024 * 1024;

export interface LibraryUsageView {
  documents: number;
  storage_bytes: number;
  /** Pages read by OCR this month. */
  ocr_pages_month: number;
  /** Whether each quota still holds. Limit values and points estimates need the plan catalog and the rate card, so M1 shows counts only. */
  within_limits: { documents: boolean; storage: boolean; ocr_pages: boolean };
  /** The storage ceiling in bytes; null when none exists (open mode), so the page shows usage without a bar. */
  storage_limit_bytes: number | null;
}

export class GetLibraryUsageUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'documents' | 'entitlements' | 'now'>) {}

  async execute(context: RequestContext): Promise<LibraryUsageView> {
    const { documents, entitlements } = this.deps;
    const workspaceId = requireWorkspace(context);
    const usage = await documents.usage(workspaceId, monthStart(this.deps.now()));

    // `check`, not `assert`: viewing usage never blocks, and in `open` mode
    // the check is logged like every other.
    const documentsCheck = await entitlements.check(workspaceId, ENTITLEMENT_KEYS.DOCUMENTS, usage.documents);
    const storageCheck = await entitlements.check(workspaceId, ENTITLEMENT_KEYS.STORAGE_MB, Math.ceil(usage.storage_bytes / MB));
    const ocrCheck = await entitlements.check(workspaceId, ENTITLEMENT_KEYS.OCR_PAGES, usage.ocr_pages_month);

    const storageLimitMb = await entitlements.numericLimit(workspaceId, ENTITLEMENT_KEYS.STORAGE_MB);

    return {
      storage_limit_bytes: storageLimitMb === null ? null : storageLimitMb * MB,
      documents: usage.documents,
      storage_bytes: usage.storage_bytes,
      ocr_pages_month: usage.ocr_pages_month,
      within_limits: {
        documents: documentsCheck.allowed,
        storage: storageCheck.allowed,
        ocr_pages: ocrCheck.allowed,
      },
    };
  }
}
