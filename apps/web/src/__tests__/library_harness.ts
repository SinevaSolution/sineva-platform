import { createHash } from 'node:crypto';
import type { RequestLibraryUploadDto } from '@/server/application/dtos/library_dto';
import type { LibraryDeps } from '@/server/application/library/library_support';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { EntitlementKey } from '@/server/domain/entitlements/entitlements';
import { CompleteLibraryUploadUseCase } from '@/server/application/use-cases/library/complete_library_upload_use_case';
import { RequestLibraryUploadUseCase } from '@/server/application/use-cases/library/request_library_upload_use_case';
import { FakeObjectStore } from './fakes/fake_object_store';
import { FakeTransactionRunner } from './fakes/fake_transaction_runner';
import {
  FakeContextSigner,
  FakeKnowledgeGateway,
  FakeLibraryDocuments,
  FakeLibraryEvents,
  FakeLibraryFolders,
  FakeLibraryLog,
  RecordingEntitlements,
} from './fakes/library_fakes';

export const WS = '11111111-1111-4111-8111-111111111111';
export const OTHER_WS = '22222222-2222-4222-8222-222222222222';
export const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OTHER_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const NOW = new Date('2026-10-22T10:00:00.000Z');

export function ctx(extra: Partial<RequestContext> = {}): RequestContext {
  return {
    user_id: USER,
    workspace_id: WS,
    session_id: 'sess-1',
    request_id: 'req-1',
    role: 'admin',
    specialist_scope: 'all',
    actor: { type: 'user', id: USER },
    ...extra,
  };
}

export const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\nprice list body');
export const ZIP_BYTES = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function uploadDto(extra: Record<string, unknown> = {}): RequestLibraryUploadDto {
  return {
    file_name: 'price list.pdf',
    content_type: 'application/pdf',
    byte_size: PDF_BYTES.length,
    sha256: sha256Hex(PDF_BYTES),
    ...extra,
  } as RequestLibraryUploadDto;
}

export interface LibraryHarness {
  deps: LibraryDeps;
  documents: FakeLibraryDocuments;
  folders: FakeLibraryFolders;
  events: FakeLibraryEvents;
  gateway: FakeKnowledgeGateway;
  signer: FakeContextSigner;
  store: FakeObjectStore;
  audit: CountingAuditLogger;
  entitlements: RecordingEntitlements;
  transactions: FakeTransactionRunner;
  log: FakeLibraryLog;
}

export function buildHarness(options: { denied?: EntitlementKey[] } = {}): LibraryHarness {
  const documents = new FakeLibraryDocuments();
  const folders = new FakeLibraryFolders(documents);
  const events = new FakeLibraryEvents();
  const gateway = new FakeKnowledgeGateway();
  const signer = new FakeContextSigner();
  const store = new FakeObjectStore();
  const audit = new CountingAuditLogger();
  const entitlements = new RecordingEntitlements(new Set(options.denied ?? []));
  const transactions = new FakeTransactionRunner();
  const log = new FakeLibraryLog();
  let jobCounter = 0;
  const deps: LibraryDeps = {
    documents,
    folders,
    events,
    gateway,
    contextSigner: signer,
    store,
    audit,
    entitlements,
    transactions,
    log,
    newJobId: () => `00000000-0000-4000-8000-${String(++jobCounter).padStart(12, '0')}`,
    now: () => NOW,
  };
  const harness: LibraryHarness = {
    deps,
    documents,
    folders,
    events,
    gateway,
    signer,
    store,
    audit,
    entitlements,
    transactions,
    log,
  };
  return harness;
}

/** Presign, simulate the browser PUT, complete. Returns the completed document. */
export async function uploadAndComplete(
  h: LibraryHarness,
  options: { bytes?: Uint8Array; dto?: Record<string, unknown>; context?: RequestContext } = {},
) {
  const bytes = options.bytes ?? PDF_BYTES;
  const context = options.context ?? ctx();
  const ticket = await new RequestLibraryUploadUseCase(h.deps).execute(
    uploadDto({ byte_size: bytes.length, sha256: sha256Hex(bytes), ...options.dto }),
    context,
  );
  const document = await h.documents.findById(context.workspace_id!, ticket.document_id);
  h.store.upload(document!.storage_key!, bytes);
  return new CompleteLibraryUploadUseCase(h.deps).execute(ticket.document_id, context);
}
