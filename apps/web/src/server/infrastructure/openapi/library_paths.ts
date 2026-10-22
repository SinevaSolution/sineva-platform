import 'server-only';

// OpenAPI entries of the Sino Library (WP-M1-32, ADR-0030). Kept in its own
// module so the large main spec stays readable; `spec.ts` spreads these in.

type Json = Record<string, unknown>;

const WORKSPACE = '/api/v1/workspaces/{workspace_id}/library';

const workspaceParam = { name: 'workspace_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const documentParam = { name: 'document_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const folderParam = { name: 'folder_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

function envelopeOf(schema: string | null, description: string): Json {
  return {
    description,
    content: {
      'application/json': {
        schema: schema
          ? {
              allOf: [
                { $ref: '#/components/schemas/StandardEnvelope' },
                { type: 'object', properties: { data: { $ref: `#/components/schemas/${schema}` } } },
              ],
            }
          : { $ref: '#/components/schemas/StandardEnvelope' },
      },
    },
  };
}

const STATUS_TEXT: Record<string, string> = {
  '401': 'Authentication required',
  '403': 'The role lacks the permission (or the member may not use the specialist)',
  '404': 'Workspace or resource not found, including another workspace (never 403)',
  '409': 'Conflict with the current state (code in errors[0].code)',
  '422': 'Validation failed (code in errors[0].code)',
  '502': 'Storage or sineva-ai answered badly. Never an unsigned URL, never a fabricated result',
  '503': 'sineva-ai is unreachable',
};

interface OperationInput {
  summary: string;
  description?: string;
  operationId: string;
  permission: string;
  params?: Json[];
  query?: Json[];
  requestSchema?: Json;
  success: { status: string; description: string; schema: string | null };
  also?: string[];
}

function operation(input: OperationInput): Json {
  const statuses = ['401', '403', '404', ...(input.requestSchema || input.query ? ['422'] : []), ...(input.also ?? [])];
  return {
    tags: ['Library'],
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    operationId: input.operationId,
    'x-permission': input.permission,
    parameters: [workspaceParam, ...(input.params ?? []), ...(input.query ?? [])],
    ...(input.requestSchema
      ? { requestBody: { required: true, content: { 'application/json': { schema: input.requestSchema } } } }
      : {}),
    responses: {
      [input.success.status]: envelopeOf(input.success.schema, input.success.description),
      ...Object.fromEntries([...new Set(statuses)].map((status) => [status, envelopeOf(null, STATUS_TEXT[status] ?? status)])),
    },
  };
}

const scopeInput = {
  oneOf: [
    { type: 'object', additionalProperties: false, required: ['scope_type'], properties: { scope_type: { const: 'workspace' } } },
    {
      type: 'object',
      additionalProperties: false,
      required: ['scope_type', 'scope_ref'],
      properties: { scope_type: { const: 'specialist' }, scope_ref: { type: 'string', example: 'sinohelp' } },
    },
  ],
};

const queryParam = (name: string, schema: Json, description?: string): Json => ({
  name,
  in: 'query',
  required: false,
  schema,
  ...(description ? { description } : {}),
});

export function libraryOpenApiPaths(): Record<string, Json> {
  return {
    [`${WORKSPACE}/uploads`]: {
      post: operation({
        summary: 'Prepare a document upload (presigned PUT to SeaweedFS)',
        description:
          'Checks type (PDF, DOCX, XLSX, CSV, PPTX, TXT, MD, JPG, PNG, WEBP), size (25 MB), the document, storage and OCR quotas and duplicates, then returns a presigned PUT pinned to the declared content type and length. The browser computes the SHA-256; `complete` checks the stored bytes against it. A presign failure is 502, never an unsigned URL. 409 `already_in_library` carries the existing document id in errors[0].detail.',
        operationId: 'prepare_library_upload',
        permission: 'library.upload',
        requestSchema: { $ref: '#/components/schemas/LibraryUploadRequest' },
        success: { status: '201', description: 'Upload ticket', schema: 'LibraryUploadTicket' },
        also: ['409', '502'],
      }),
    },
    [`${WORKSPACE}/documents`]: {
      get: operation({
        summary: 'List Library documents',
        description:
          'Only documents the caller may see: a member limited to selected specialists sees workspace documents and those of their specialists. Pending uploads and documents being deleted are hidden unless status=deleting is asked for.',
        operationId: 'list_library_documents',
        permission: 'library.read',
        query: [
          queryParam(
            'status',
            { type: 'string', enum: ['queued', 'processing', 'ready', 'needs_attention', 'failed', 'deleting', 'reading'] },
            '`reading` is queued and processing together',
          ),
          queryParam('scope_type', { type: 'string', enum: ['workspace', 'specialist'] }),
          queryParam('scope_ref', { type: 'string' }),
          queryParam(
            'used_by',
            { type: 'string', example: 'sinosales' },
            'Documents this specialist can use: marked Everyone, or chosen for it',
          ),
          queryParam('sort', { type: 'string', enum: ['newest', 'oldest', 'name', 'size'], default: 'newest' }),
          queryParam('source_type', { type: 'string', enum: ['upload', 'url', 'crawl', 'sync', 'chat_save', 'note', 'ai_tool'] }),
          queryParam('language', { type: 'string', enum: ['id', 'en', 'mixed', 'unknown'] }),
          queryParam('folder_id', { type: 'string' }, 'A folder id, or `root` for documents outside every folder'),
          queryParam('q', { type: 'string', maxLength: 100 }, 'Title search'),
          queryParam('cursor', { type: 'string', format: 'uuid' }),
          queryParam('limit', { type: 'integer', minimum: 1, maximum: 100, default: 25 }),
        ],
        success: { status: '200', description: 'Documents and the next cursor', schema: 'LibraryDocumentList' },
      }),
      post: operation({
        summary: 'Create a note or save text from a chat',
        description:
          'source_type `note` or `chat_save`. URLs, crawls and synced sources are not accepted yet (422). The platform computes the hash; a chat save defaults its scope to the Room specialist, or the workspace in the Hub. A hint for KTP or NPWP patterns is set in status_detail and never blocks.',
        operationId: 'create_library_document',
        permission: 'library.upload',
        requestSchema: { $ref: '#/components/schemas/LibraryCreateDocumentRequest' },
        success: { status: '201', description: 'The document (queued until sineva-ai reports)', schema: 'LibraryDocument' },
        also: ['409', '502'],
      }),
    },
    [`${WORKSPACE}/documents/{document_id}`]: {
      get: operation({
        summary: 'Get a Library document',
        operationId: 'get_library_document',
        permission: 'library.read',
        params: [documentParam],
        success: { status: '200', description: 'The document', schema: 'LibraryDocument' },
      }),
      patch: operation({
        summary: 'Rename, move, change scope or set the review interval',
        description:
          'A scope change relabels existing chunks in sineva-ai without re-embedding and is audited as library.document.scope_changed. If the relabel fails the new scopes are saved and `acl_sync_pending` stays true (502 or 503).',
        operationId: 'update_library_document',
        permission: 'library.manage',
        params: [documentParam],
        requestSchema: { $ref: '#/components/schemas/LibraryUpdateDocumentRequest' },
        success: { status: '200', description: 'The updated document', schema: 'LibraryDocument' },
        also: ['502', '503'],
      }),
      delete: operation({
        summary: 'Delete a document, its file, text, chunks and vectors',
        description:
          'Marks the document deleting, has sineva-ai delete and verify (no vector remaining), deletes the file, then removes the rows. A stray vector, an unreachable sineva-ai or a failed file delete leaves the document in deleting and answers 502 or 503; calling DELETE again resumes.',
        operationId: 'delete_library_document',
        permission: 'library.delete',
        params: [documentParam],
        success: { status: '200', description: 'Deleted, with the counts sineva-ai verified', schema: 'LibraryDeleteResult' },
        also: ['502', '503'],
      }),
    },
    [`${WORKSPACE}/documents/{document_id}/complete`]: {
      post: operation({
        summary: 'Complete an upload',
        description:
          'Reads the stored object, checks size, SHA-256 and magic bytes against what was declared (a mismatch removes the object and the row, 422), audits library.document.uploaded and asks sineva-ai to ingest. If sineva-ai is unreachable the document stays queued with status_detail.reason_code `ingest_service_unavailable` (or `ingest_service_error`) and this call still answers 200; it never becomes ready without sineva-ai saying so.',
        operationId: 'complete_library_upload',
        permission: 'library.upload',
        params: [documentParam],
        success: { status: '200', description: 'The document', schema: 'LibraryDocument' },
        also: ['409', '422'],
      }),
    },
    [`${WORKSPACE}/documents/{document_id}/reindex`]: {
      post: operation({
        summary: 'Reindex a document (or refresh a running job)',
        description:
          'A document with a running job is refreshed by polling sineva-ai instead of starting a second job; otherwise a new job is requested. Checks the OCR quota for scannable types.',
        operationId: 'reindex_library_document',
        permission: 'library.manage',
        params: [documentParam],
        success: { status: '202', description: 'The document', schema: 'LibraryDocument' },
        also: ['502', '503'],
      }),
    },
    [`${WORKSPACE}/documents/{document_id}/preview`]: {
      get: operation({
        summary: 'Preview the text sineva-ai extracted (to verify OCR)',
        operationId: 'preview_library_document',
        permission: 'library.read',
        params: [documentParam],
        query: [
          queryParam('page_from', { type: 'integer', minimum: 1, default: 1 }),
          queryParam('page_to', { type: 'integer', minimum: 1 }, 'At most 20 pages per call'),
        ],
        success: { status: '200', description: 'Pages of extracted text', schema: 'LibraryPreview' },
        also: ['409', '502', '503'],
      }),
    },
    [`${WORKSPACE}/folders`]: {
      get: operation({
        summary: 'List Library folders (flat; the client builds the tree)',
        operationId: 'list_library_folders',
        permission: 'library.read',
        success: { status: '200', description: 'Folders', schema: 'LibraryFolderList' },
      }),
      post: operation({
        summary: 'Create a collection (a folder: depth at most 3, unique name per parent)',
        description:
          'Omitting `scopes` takes the parent collection\'s access, or Everyone at the top level. Squad and workflow scopes are reserved and answer 422 until those features ship.',
        operationId: 'create_library_folder',
        permission: 'library.manage',
        requestSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            parent_id: { type: ['string', 'null'], format: 'uuid' },
            scopes: { type: 'array', items: scopeInput, description: 'Who can use this collection' },
          },
        },
        success: { status: '201', description: 'The folder', schema: 'LibraryFolder' },
        also: ['409'],
      }),
    },
    [`${WORKSPACE}/folders/{folder_id}`]: {
      patch: operation({
        summary: 'Rename, move or change who can use a collection',
        description:
          'Changing `scopes` rewrites the access of the documents that follow the collection (a relabel, never a re-read). A document whose relabel fails stays flagged `acl_sync_pending`; the collection change itself still succeeds.',
        operationId: 'update_library_folder',
        permission: 'library.manage',
        params: [folderParam],
        requestSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            parent_id: { type: ['string', 'null'], format: 'uuid' },
            scopes: { type: 'array', items: scopeInput },
          },
        },
        success: { status: '200', description: 'The folder', schema: 'LibraryFolder' },
        also: ['409'],
      }),
      delete: operation({
        summary: 'Delete an empty folder',
        description: 'A folder with folders or documents inside is 409 `folder_not_empty`: there is no silent cascade.',
        operationId: 'delete_library_folder',
        permission: 'library.manage',
        params: [folderParam],
        success: { status: '200', description: 'Deleted', schema: null },
        also: ['409'],
      }),
    },
    [`${WORKSPACE}/try`]: {
      post: operation({
        summary: 'Try a question against a scope',
        description:
          'Retrieval only. The scope is computed from the session (`workspace` plus the chosen specialist); the body cannot carry principals. Hits are re-checked by the platform: another workspace, a document not ready and a document outside the scope are dropped. 503 when sineva-ai is unreachable, never a canned result.',
        operationId: 'try_library_retrieval',
        permission: 'library.manage',
        requestSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 500 },
            agent_slug: { type: ['string', 'null'], example: 'sinohelp' },
            top_k: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
        },
        success: { status: '200', description: 'Passages, or an honest abstention', schema: 'LibraryTryResult' },
        also: ['502', '503'],
      }),
    },
    [`${WORKSPACE}/summary`]: {
      get: operation({
        summary: 'Counts for the Library header and the collections list',
        description:
          'Ready, being read, needs a look and could not read, plus documents per collection, over what the caller may see.',
        operationId: 'get_library_summary',
        permission: 'library.read',
        success: { status: '200', description: 'Status and collection counts', schema: 'LibrarySummary' },
      }),
    },
    [`${WORKSPACE}/knowledge`]: {
      get: operation({
        summary: 'What Sino and each specialist know',
        description:
          'Ready documents each companion can use: Everyone\'s for Sino in team chats, Everyone\'s plus the ones chosen for it for a specialist. Only the specialists the caller may use are listed.',
        operationId: 'get_library_knowledge',
        permission: 'library.read',
        success: { status: '200', description: 'Document counts per companion', schema: 'LibraryKnowledge' },
      }),
    },
    [`${WORKSPACE}/usage`]: {
      get: operation({
        summary: 'Library usage (counts only in M1)',
        operationId: 'get_library_usage',
        permission: 'library.usage.view',
        success: { status: '200', description: 'Counts and whether each quota holds', schema: 'LibraryUsage' },
      }),
    },
    '/api/internal/v1/library/ingest-events': {
      post: {
        tags: ['Internal'],
        summary: 'Ingest progress reported by sineva-ai',
        description:
          'Guarded by X-Internal-Api-Key only. The tenant must own the document (404 otherwise). An event applies only for the document\'s current job and a higher sequence; every event is stored. 200 acknowledges even a duplicate or a stale event (`applied: false`). Proposed contract, pending sineva-ai: see the library_* fixtures.',
        operationId: 'ingest_library_event',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LibraryIngestEvent' } } } },
        responses: {
          '200': envelopeOf(null, 'Acknowledged: data is { applied, duplicate }'),
          '401': envelopeOf(null, 'Missing or invalid X-Internal-Api-Key header'),
          '404': envelopeOf(null, 'No such document under that tenant'),
          '422': envelopeOf(null, 'Validation failed'),
        },
      },
    },
  };
}

const uuid = { type: 'string', format: 'uuid' };
const nullableString = { type: ['string', 'null'] };
const statusDetail = {
  type: ['object', 'null'],
  properties: {
    reason_code: { type: 'string' },
    pages: { type: 'array', items: { type: 'integer' } },
    progress: { type: 'object', properties: { current: { type: 'integer' }, total: { type: 'integer' } } },
    personal_data_hint: { type: 'boolean' },
  },
};

export const LIBRARY_COMPONENT_SCHEMAS: Record<string, Json> = {
  LibraryScope: {
    type: 'object',
    properties: {
      scope_type: { type: 'string', enum: ['workspace', 'specialist', 'squad', 'workflow'], description: 'squad and workflow are reserved' },
      scope_ref: { ...nullableString, description: 'Agent slug or squad id; null for the workspace scope' },
    },
  },
  LibraryDocument: {
    type: 'object',
    properties: {
      id: uuid,
      folder_id: { type: ['string', 'null'], format: 'uuid' },
      title: { type: 'string' },
      source_type: { type: 'string', enum: ['upload', 'url', 'crawl', 'sync', 'chat_save', 'note', 'ai_tool'] },
      mime_type: { type: 'string' },
      byte_size: { type: 'integer' },
      language: { type: 'string', enum: ['id', 'en', 'mixed', 'unknown'] },
      status: { type: 'string', enum: ['queued', 'processing', 'ready', 'needs_attention', 'failed', 'deleting'] },
      status_detail: statusDetail,
      page_count: { type: ['integer', 'null'] },
      chunk_count: { type: 'integer' },
      embedding_model: nullableString,
      last_indexed_at: { type: ['string', 'null'], format: 'date-time' },
      source_updated_at: { type: ['string', 'null'], format: 'date-time' },
      review_interval_days: { type: ['integer', 'null'] },
      review_due_at: { type: ['string', 'null'], format: 'date-time' },
      scopes: { type: 'array', items: { $ref: '#/components/schemas/LibraryScope' } },
      acl_sync_pending: { type: 'boolean' },
      access_inherited: { type: 'boolean', description: 'True while the document follows its collection\'s access' },
      created_by: uuid,
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  LibraryDocumentList: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/LibraryDocument' } },
      next_cursor: { type: ['string', 'null'] },
    },
  },
  LibraryFolder: {
    type: 'object',
    properties: {
      id: uuid,
      parent_id: { type: ['string', 'null'], format: 'uuid' },
      name: { type: 'string' },
      scopes: { type: 'array', items: { $ref: '#/components/schemas/LibraryScope' }, description: 'Who can use this collection' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  LibraryFolderList: {
    type: 'object',
    properties: { items: { type: 'array', items: { $ref: '#/components/schemas/LibraryFolder' } } },
  },
  LibraryUploadRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['file_name', 'content_type', 'byte_size', 'sha256'],
    properties: {
      file_name: { type: 'string', maxLength: 255, example: 'daftar harga.pdf' },
      content_type: { type: 'string', example: 'application/pdf' },
      byte_size: { type: 'integer', minimum: 1, maximum: 26214400 },
      sha256: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Computed by the browser; checked against the stored bytes' },
      folder_id: { type: ['string', 'null'], format: 'uuid' },
      scopes: {
        type: 'array',
        items: scopeInput,
        description: 'Omit to take the collection\'s access (Everyone at the top level); sending scopes is an override',
      },
      review_interval_days: { type: ['integer', 'null'], minimum: 1, maximum: 730 },
    },
  },
  LibraryUploadTicket: {
    type: 'object',
    properties: {
      document_id: uuid,
      upload_url: { type: 'string' },
      method: { type: 'string', enum: ['PUT'] },
      headers: { type: 'object', additionalProperties: { type: 'string' } },
      expires_in_seconds: { type: 'integer' },
      max_bytes: { type: 'integer' },
    },
  },
  LibraryCreateDocumentRequest: {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['source_type', 'title', 'content'],
        properties: {
          source_type: { const: 'note' },
          title: { type: 'string', maxLength: 200 },
          content: { type: 'string', maxLength: 100000 },
          folder_id: { type: ['string', 'null'], format: 'uuid' },
          scopes: { type: 'array', items: scopeInput },
          review_interval_days: { type: ['integer', 'null'] },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['source_type', 'conversation_id', 'content'],
        properties: {
          source_type: { const: 'chat_save' },
          conversation_id: uuid,
          title: { type: 'string', maxLength: 200 },
          content: { type: 'string', maxLength: 100000 },
          folder_id: { type: ['string', 'null'], format: 'uuid' },
          scopes: { type: 'array', items: scopeInput },
        },
      },
    ],
  },
  LibraryUpdateDocumentRequest: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      title: { type: 'string', maxLength: 200 },
      folder_id: { type: ['string', 'null'], format: 'uuid' },
      scopes: { type: 'array', items: scopeInput, description: 'An override: the document stops following its collection' },
      inherit_access: { const: true, description: 'Put the document back on its collection\'s access; not with scopes' },
      review_interval_days: { type: ['integer', 'null'], minimum: 1, maximum: 730 },
    },
  },
  LibraryDeleteResult: {
    type: 'object',
    properties: {
      id: uuid,
      deleted: { type: 'boolean' },
      chunks_deleted: { type: 'integer' },
      vectors_deleted: { type: 'integer' },
    },
  },
  LibraryPreview: {
    type: 'object',
    properties: {
      document_id: uuid,
      status: { type: 'string' },
      page_count: { type: 'integer' },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            text: { type: 'string' },
            ocr: { type: 'boolean' },
            readable: { type: 'boolean' },
          },
        },
      },
      next_page: { type: ['integer', 'null'] },
    },
  },
  LibraryTryResult: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            document_id: uuid,
            title: { type: 'string' },
            chunk_id: { type: 'string' },
            page: { type: ['integer', 'null'] },
            section_path: nullableString,
            snippet: { type: 'string', maxLength: 400 },
            source_uri: nullableString,
            trust_label: { type: 'string' },
          },
        },
      },
      abstained: { type: 'boolean' },
      abstain_reason: nullableString,
      principals: { type: 'array', items: { type: 'string' } },
    },
  },
  LibraryUsage: {
    type: 'object',
    properties: {
      documents: { type: 'integer' },
      storage_bytes: { type: 'integer' },
      ocr_pages_month: { type: 'integer' },
      within_limits: {
        type: 'object',
        properties: { documents: { type: 'boolean' }, storage: { type: 'boolean' }, ocr_pages: { type: 'boolean' } },
      },
      storage_limit_bytes: { type: ['integer', 'null'], description: 'Null when the workspace has no storage limit' },
    },
  },
  LibrarySummary: {
    type: 'object',
    properties: {
      total: { type: 'integer' },
      by_status: {
        type: 'object',
        properties: {
          ready: { type: 'integer' },
          reading: { type: 'integer' },
          needs_attention: { type: 'integer' },
          failed: { type: 'integer' },
        },
      },
      by_folder: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Documents per collection id' },
      in_root: { type: 'integer' },
    },
  },
  LibraryKnowledge: {
    type: 'object',
    properties: {
      everyone: { type: 'integer' },
      specialists: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Per specialist slug' },
    },
  },
  LibraryIngestEvent: {
    type: 'object',
    additionalProperties: false,
    required: ['event_id', 'tenant_id', 'document_id', 'job_id', 'sequence', 'stage', 'status', 'occurred_at'],
    properties: {
      event_id: uuid,
      tenant_id: uuid,
      document_id: uuid,
      job_id: uuid,
      sequence: { type: 'integer', minimum: 1 },
      stage: { type: 'string', enum: ['received', 'parsing', 'ocr', 'chunking', 'embedding', 'indexing', 'completed', 'failed'] },
      status: { type: 'string', enum: ['processing', 'ready', 'needs_attention', 'failed'] },
      occurred_at: { type: 'string', format: 'date-time' },
      progress: { type: ['object', 'null'], properties: { current: { type: 'integer' }, total: { type: 'integer' } } },
      reason_code: { type: ['string', 'null'], pattern: '^[a-z][a-z0-9_]{0,63}$' },
      pages: { type: 'array', items: { type: 'integer' }, maxItems: 200 },
      page_count: { type: ['integer', 'null'] },
      chunk_count: { type: ['integer', 'null'] },
      language: { type: ['string', 'null'], enum: ['id', 'en', 'mixed', 'unknown', null] },
      embedding_model: nullableString,
      ocr_pages: { type: ['integer', 'null'] },
      personal_data_hint: { type: 'boolean', default: false },
    },
  },
};
