import { z } from 'zod';
import { CANONICAL_SPECIALIST_SLUGS } from '@/server/domain/chat/specialist_catalog';
import {
  LIBRARY_FOLDER_NAME_MAX,
  LIBRARY_LANGUAGES,
  LIBRARY_MAX_BYTES,
  LIBRARY_NOTE_MAX_CHARS,
  LIBRARY_REVIEW_INTERVAL_MAX_DAYS,
  LIBRARY_SORTS,
  LIBRARY_SOURCE_TYPES,
  LIBRARY_STATUS_FILTERS,
  LIBRARY_TITLE_MAX,
  LIBRARY_TRY_QUERY_MAX,
  LIBRARY_TRY_TOP_K_MAX,
} from '@/server/domain/library/library';

// Public request schemas of the Library routes. Identity and workspace come
// from the session and the URL; no schema here names them.

// Squad (M4) and workflow (M3) scopes are reserved and deliberately not accepted here: the API answers 422 until those features ship (ADR-0033).
export const LibraryScopeInputSchema = z.discriminatedUnion('scope_type', [
  z.object({ scope_type: z.literal('workspace') }).strict(),
  z.object({ scope_type: z.literal('specialist'), scope_ref: z.string().trim().min(1).max(32) }).strict(),
]);
export type LibraryScopeInput = z.infer<typeof LibraryScopeInputSchema>;

const scopesField = z.array(LibraryScopeInputSchema).min(1).max(8).optional();
const reviewInterval = z.number().int().min(1).max(LIBRARY_REVIEW_INTERVAL_MAX_DAYS);
const uuid = z.string().uuid();
// File names come from the browser; control characters and path separators have no place in one.
const FILE_NAME = /^[^/\\\u0000-\u001f]+$/;

export const RequestLibraryUploadSchema = z
  .object({
    file_name: z.string().trim().min(1).max(255).regex(FILE_NAME, 'File name cannot contain path separators'),
    content_type: z.string().trim().min(1).max(127),
    byte_size: z.number().int().min(1).max(LIBRARY_MAX_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters'),
    folder_id: uuid.nullish(),
    scopes: scopesField,
    review_interval_days: reviewInterval.nullish(),
  })
  .strict();
export type RequestLibraryUploadDto = z.infer<typeof RequestLibraryUploadSchema>;

export const CreateLibraryDocumentSchema = z.discriminatedUnion('source_type', [
  z
    .object({
      source_type: z.literal('note'),
      title: z.string().trim().min(1).max(LIBRARY_TITLE_MAX),
      content: z.string().trim().min(1).max(LIBRARY_NOTE_MAX_CHARS),
      folder_id: uuid.nullish(),
      scopes: scopesField,
      review_interval_days: reviewInterval.nullish(),
    })
    .strict(),
  z
    .object({
      source_type: z.literal('chat_save'),
      conversation_id: uuid,
      title: z.string().trim().min(1).max(LIBRARY_TITLE_MAX).optional(),
      content: z.string().trim().min(1).max(LIBRARY_NOTE_MAX_CHARS),
      folder_id: uuid.nullish(),
      scopes: scopesField,
    })
    .strict(),
]);
export type CreateLibraryDocumentDto = z.infer<typeof CreateLibraryDocumentSchema>;

export const UpdateLibraryDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(LIBRARY_TITLE_MAX).optional(),
    folder_id: uuid.nullable().optional(),
    scopes: z.array(LibraryScopeInputSchema).min(1).max(8).optional(),
    review_interval_days: reviewInterval.nullable().optional(),
    /** Put the document back on its collection's access ("Same as the collection"). */
    inherit_access: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change')
  .refine((value) => !(value.inherit_access && value.scopes), 'Send scopes or inherit_access, not both');
export type UpdateLibraryDocumentDto = z.infer<typeof UpdateLibraryDocumentSchema>;

export const ListLibraryDocumentsQuerySchema = z.object({
  status: z.enum(LIBRARY_STATUS_FILTERS).optional(),
  scope_type: z.enum(['workspace', 'specialist']).optional(),
  scope_ref: z.string().max(32).optional(),
  // Documents a specialist can use: Everyone's and the ones scoped to it. Sino has no scope of its own.
  used_by: z
    .string()
    .refine((slug) => slug !== 'sino' && CANONICAL_SPECIALIST_SLUGS.has(slug), 'Unknown specialist')
    .optional(),
  sort: z.enum(LIBRARY_SORTS).optional(),
  source_type: z.enum(LIBRARY_SOURCE_TYPES).optional(),
  language: z.enum(LIBRARY_LANGUAGES).optional(),
  // `root` selects documents outside every folder; omitting it selects all.
  folder_id: z.union([uuid, z.literal('root')]).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListLibraryDocumentsQueryDto = z.infer<typeof ListLibraryDocumentsQuerySchema>;

export const LIBRARY_PREVIEW_MAX_PAGES = 20;
export const PreviewLibraryDocumentQuerySchema = z
  .object({
    page_from: z.coerce.number().int().min(1).default(1),
    page_to: z.coerce.number().int().min(1).optional(),
  })
  .transform((value) => ({
    page_from: value.page_from,
    page_to: Math.min(value.page_to ?? value.page_from + LIBRARY_PREVIEW_MAX_PAGES - 1, value.page_from + LIBRARY_PREVIEW_MAX_PAGES - 1),
  }))
  .refine((value) => value.page_to >= value.page_from, 'page_to must not be below page_from');
export type PreviewLibraryDocumentQueryDto = z.infer<typeof PreviewLibraryDocumentQuerySchema>;

export const TryLibrarySchema = z
  .object({
    query: z.string().trim().min(1).max(LIBRARY_TRY_QUERY_MAX),
    agent_slug: z.string().trim().min(1).max(32).nullish(),
    top_k: z.number().int().min(1).max(LIBRARY_TRY_TOP_K_MAX).default(5),
  })
  .strict();
export type TryLibraryDto = z.infer<typeof TryLibrarySchema>;

const folderName = z.string().trim().min(1).max(LIBRARY_FOLDER_NAME_MAX).regex(/^[^/\\\u0000-\u001f]+$/, 'Folder name cannot contain slashes');

export const CreateLibraryFolderSchema = z
  // Omitting `scopes` takes the parent's access, or Everyone at the top level.
  .object({ name: folderName, parent_id: uuid.nullish(), scopes: scopesField })
  .strict();
export type CreateLibraryFolderDto = z.infer<typeof CreateLibraryFolderSchema>;

export const UpdateLibraryFolderSchema = z
  .object({
    name: folderName.optional(),
    parent_id: uuid.nullable().optional(),
    scopes: z.array(LibraryScopeInputSchema).min(1).max(8).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateLibraryFolderDto = z.infer<typeof UpdateLibraryFolderSchema>;
