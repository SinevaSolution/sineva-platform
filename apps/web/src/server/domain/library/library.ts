import { ValidationError } from '@/server/domain/errors/domain_error';
import { detectImageType } from '@/server/domain/profile/avatar';
import { validateWorkspaceId } from '@/server/domain/tenancy/tenant_isolation';

// Library rules in one place: limits, accepted types, object keys, folder
// geometry. Pure functions only; nothing here touches storage or the database.

/** Proposed default (OQ-LIB-5); the per-plan value arrives with the entitlement catalog. */
export const LIBRARY_MAX_BYTES = 25 * 1024 * 1024;
export const LIBRARY_PRESIGN_SECONDS = 600;
export const LIBRARY_MAX_FOLDER_DEPTH = 3;
export const LIBRARY_FOLDER_NAME_MAX = 80;
export const LIBRARY_TITLE_MAX = 200;
/** Same cap as the old sineva-ai index endpoint; a note is text a person typed or saved. */
export const LIBRARY_NOTE_MAX_CHARS = 100_000;
export const LIBRARY_TRY_QUERY_MAX = 500;
export const LIBRARY_TRY_TOP_K_MAX = 10;

export const LIBRARY_STATUSES = [
  'queued',
  'processing',
  'ready',
  'needs_attention',
  'failed',
  'deleting',
] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export const LIBRARY_SOURCE_TYPES = [
  'upload',
  'url',
  'crawl',
  'sync',
  'chat_save',
  'note',
  'ai_tool',
] as const;
export type LibrarySourceType = (typeof LIBRARY_SOURCE_TYPES)[number];

/** Source types the platform can create in this release (url, crawl and sync arrive with sources in M2). */
export const LIBRARY_CREATABLE_SOURCE_TYPES = ['upload', 'note', 'chat_save'] as const;

export const LIBRARY_LANGUAGES = ['id', 'en', 'mixed', 'unknown'] as const;
export type LibraryLanguage = (typeof LIBRARY_LANGUAGES)[number];

// `squad` (M4) and `workflow` (M3) are reserved: stored and understood by the
// domain, rejected by the request schemas until those features ship (ADR-0033).
export const LIBRARY_SCOPE_TYPES = ['workspace', 'specialist', 'squad', 'workflow'] as const;
export type LibraryScopeType = (typeof LIBRARY_SCOPE_TYPES)[number];

/** Filter values for the list: every status, plus `reading` for queued and processing together. */
export const LIBRARY_STATUS_FILTERS = [...LIBRARY_STATUSES, 'reading'] as const;
export type LibraryStatusFilter = (typeof LIBRARY_STATUS_FILTERS)[number];

export const LIBRARY_SORTS = ['newest', 'oldest', 'name', 'size'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** Review intervals offered by the "Remind me to check this" control. */
export const LIBRARY_REVIEW_INTERVAL_MAX_DAYS = 730;

// --- File types -----------------------------------------------------------

export type LibraryFileKind = 'pdf' | 'ooxml' | 'image' | 'text';

interface FileTypeRule {
  kind: LibraryFileKind;
  /** Content types a browser may declare for this extension. */
  mime: readonly string[];
  /** Scanned pages possible, so the OCR page quota is relevant. */
  ocr: boolean;
}

const OOXML = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

// Allowlist, never a denylist: video, audio, SVG (can carry script), archives
// and macro-enabled Office files are simply absent (FR-LIB-06).
const FILE_TYPES: Record<string, FileTypeRule> = {
  pdf: { kind: 'pdf', mime: ['application/pdf'], ocr: true },
  docx: { kind: 'ooxml', mime: [OOXML.docx], ocr: false },
  xlsx: { kind: 'ooxml', mime: [OOXML.xlsx], ocr: false },
  pptx: { kind: 'ooxml', mime: [OOXML.pptx], ocr: false },
  csv: { kind: 'text', mime: ['text/csv', 'application/vnd.ms-excel', 'text/plain'], ocr: false },
  txt: { kind: 'text', mime: ['text/plain'], ocr: false },
  md: { kind: 'text', mime: ['text/markdown', 'text/x-markdown', 'text/plain'], ocr: false },
  jpg: { kind: 'image', mime: ['image/jpeg'], ocr: true },
  jpeg: { kind: 'image', mime: ['image/jpeg'], ocr: true },
  png: { kind: 'image', mime: ['image/png'], ocr: true },
  webp: { kind: 'image', mime: ['image/webp'], ocr: true },
};

export const LIBRARY_ACCEPTED_EXTENSIONS = Object.keys(FILE_TYPES);

export interface ResolvedFileType {
  extension: string;
  kind: LibraryFileKind;
  content_type: string;
  ocr: boolean;
}

function unsupportedFile(detail: string): ValidationError {
  return new ValidationError('This file type is not supported in the Library', [
    { code: 'unsupported_file_type', field: 'file_name', detail },
  ]);
}

/**
 * Checks the extension against the allowlist and the declared content type
 * against what that extension may carry. A double extension such as
 * `report.pdf.exe` fails because only the last one counts and `.exe` is absent.
 */
export function resolveFileType(fileName: string, contentType: string): ResolvedFileType {
  const dot = fileName.lastIndexOf('.');
  const extension = dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1).toLowerCase() : '';
  const rule = Object.prototype.hasOwnProperty.call(FILE_TYPES, extension)
    ? FILE_TYPES[extension]
    : undefined;
  if (!rule) {
    throw unsupportedFile('Use PDF, DOCX, XLSX, CSV, PPTX, TXT, MD, JPG, PNG or WEBP');
  }
  const declared = contentType.toLowerCase().split(';')[0]!.trim();
  if (!rule.mime.includes(declared)) {
    throw unsupportedFile('The content type does not match the file extension');
  }
  return { extension, kind: rule.kind, content_type: declared, ocr: rule.ocr };
}

/** The kind a stored content type belongs to; used when only the content type survives (after presign). */
export function fileKindForContentType(contentType: string): LibraryFileKind | null {
  const rule = Object.values(FILE_TYPES).find((candidate) => candidate.mime.includes(contentType));
  return rule?.kind ?? null;
}

const PDF_MAGIC =[0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const TEXT_SNIFF_BYTES = 8192;

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return bytes.length >= magic.length && magic.every((byte, i) => bytes[i] === byte);
}

/**
 * Whether the stored bytes look like the declared kind. The declared type is
 * attacker-controlled, so the bytes decide. OOXML is checked as a ZIP
 * container only; the deep structure is the reader's job. Plain text has no
 * signature, so it is "no NUL byte in the first 8 KB", which separates it from
 * every binary format on the allowlist.
 */
export function bytesMatchFileKind(kind: LibraryFileKind, bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }
  switch (kind) {
    case 'pdf':
      return startsWith(bytes, PDF_MAGIC);
    case 'ooxml':
      return startsWith(bytes, ZIP_MAGIC);
    case 'image':
      return detectImageType(bytes) !== null;
    case 'text':
      return !bytes.subarray(0, TEXT_SNIFF_BYTES).includes(0);
  }
}

// --- Identifiers and keys -------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertLibraryUuid(value: string, field: string): void {
  if (!UUID.test(value)) {
    throw new ValidationError(`Invalid ${field}`, [
      { code: `invalid_${field}`, field, detail: `${field} must be a UUID` },
    ]);
  }
}

/**
 * Where the original file lives. Built only from validated UUIDs so no
 * user-supplied string shapes a storage path (path traversal, key collision).
 */
export function sourceObjectKey(workspaceId: string, documentId: string): string {
  validateWorkspaceId(workspaceId);
  assertLibraryUuid(documentId, 'document_id');
  return `t/${workspaceId}/library/${documentId}/source`;
}

export function isValidSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return base.slice(0, LIBRARY_TITLE_MAX);
}

export function reviewDueAt(from: Date, intervalDays: number | null): Date | null {
  if (intervalDays === null) {
    return null;
  }
  return new Date(from.getTime() + intervalDays * 24 * 60 * 60 * 1000);
}

// --- Folders --------------------------------------------------------------

export interface FolderNode {
  id: string;
  parent_id: string | null;
}

function depthOf(folders: FolderNode[], id: string | null): number {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let depth = 0;
  let cursor = id;
  // The bound guards against a cycle that bad data could contain.
  while (cursor !== null && depth <= folders.length) {
    depth += 1;
    cursor = byId.get(cursor)?.parent_id ?? null;
  }
  return depth;
}

function heightOf(folders: FolderNode[], id: string): number {
  const children = folders.filter((folder) => folder.parent_id === id);
  return 1 + Math.max(0, ...children.map((child) => heightOf(folders, child.id)));
}

/**
 * Deepest level the tree reaches if `moving` (null for a new folder) is placed
 * under `newParent`: the parent's depth plus the height of the moved subtree.
 * Callers refuse a result above `LIBRARY_MAX_FOLDER_DEPTH`.
 */
export function folderDepthAfterMove(
  folders: FolderNode[],
  newParent: string | null,
  moving: string | null,
): number {
  const subtreeHeight = moving === null ? 1 : heightOf(folders, moving);
  return depthOf(folders, newParent) + subtreeHeight;
}

export function wouldCreateFolderCycle(
  folders: FolderNode[],
  moving: string,
  newParent: string | null,
): boolean {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let cursor = newParent;
  for (let hops = 0; cursor !== null && hops <= folders.length; hops += 1) {
    if (cursor === moving) {
      return true;
    }
    cursor = byId.get(cursor)?.parent_id ?? null;
  }
  return false;
}
