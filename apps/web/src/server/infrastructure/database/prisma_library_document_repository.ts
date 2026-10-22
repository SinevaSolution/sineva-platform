import 'server-only';
import { Prisma, type PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { LibraryLanguage, LibrarySourceType, LibraryStatus } from '@/server/domain/library/library';
import type { DocumentAccess, ScopeRef } from '@/server/domain/library/library_access';
import type { LibrarySort } from '@/server/domain/library/library';
import type { LibraryDocumentEntity, LibraryStatusDetail } from '@/server/domain/library/library_entities';
import type {
  LibraryDocumentFilter,
  LibraryDocumentPatch,
  LibraryDocumentRepository,
  LibraryKnowledgeCounts,
  LibrarySummaryCounts,
  LibraryUsage,
  NewLibraryDocument,
} from '@/server/domain/repositories/library_repository';
import { activeClient } from './prisma_transaction_runner';

interface DocumentRow {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
  source_type: string;
  source_id: string | null;
  storage_key: string | null;
  mime_type: string;
  byte_size: number;
  content_hash: string;
  language: string;
  status: string;
  status_detail: unknown;
  page_count: number | null;
  chunk_count: number;
  ocr_page_count: number;
  embedding_model: string | null;
  last_indexed_at: Date | null;
  source_updated_at: Date | null;
  review_interval_days: number | null;
  review_due_at: Date | null;
  review_reminded_at: Date | null;
  ingest_job_id: string | null;
  ingest_attempted_at: Date | null;
  last_ingest_sequence: number;
  acl_synced_at: Date | null;
  access_inherited: boolean;
  uploaded_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  scopes: Array<{ scope_type: string; scope_ref: string }>;
}

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

function mapDocument(row: DocumentRow): LibraryDocumentEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    folder_id: row.folder_id,
    title: row.title,
    source_type: row.source_type as LibrarySourceType,
    source_id: row.source_id,
    storage_key: row.storage_key,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    content_hash: row.content_hash,
    language: row.language as LibraryLanguage,
    status: row.status as LibraryStatus,
    status_detail:
      typeof row.status_detail === 'object' && row.status_detail !== null && !Array.isArray(row.status_detail)
        ? (row.status_detail as LibraryStatusDetail)
        : null,
    page_count: row.page_count,
    chunk_count: row.chunk_count,
    ocr_page_count: row.ocr_page_count,
    embedding_model: row.embedding_model,
    last_indexed_at: iso(row.last_indexed_at),
    source_updated_at: iso(row.source_updated_at),
    review_interval_days: row.review_interval_days,
    review_due_at: iso(row.review_due_at),
    review_reminded_at: iso(row.review_reminded_at),
    ingest_job_id: row.ingest_job_id,
    ingest_attempted_at: iso(row.ingest_attempted_at),
    last_ingest_sequence: row.last_ingest_sequence,
    acl_synced_at: iso(row.acl_synced_at),
    access_inherited: row.access_inherited,
    uploaded_at: iso(row.uploaded_at),
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    scopes: row.scopes
      .map((scope) => ({ scope_type: scope.scope_type as ScopeRef['scope_type'], scope_ref: scope.scope_ref }))
      .sort((a, b) => `${a.scope_type}:${a.scope_ref}`.localeCompare(`${b.scope_type}:${b.scope_ref}`)),
  };
}

/** `undefined` keys are left out so an absent field means "leave as is". */
function toData(patch: LibraryDocumentPatch): Prisma.LibraryDocumentUncheckedUpdateManyInput {
  const { status_detail, ...rest } = patch;
  return {
    ...rest,
    ...(status_detail !== undefined
      ? { status_detail: status_detail === null ? Prisma.DbNull : (status_detail as Prisma.InputJsonValue) }
      : {}),
    // `updated_at` does not update itself (known debt), so every write sets it.
    updated_at: new Date(),
  };
}

/** What a member limited to some specialists may see: Everyone's documents and their specialists'. A squad or workflow scope needs membership that does not exist yet, so it never matches. */
function accessFilter(access: DocumentAccess): Prisma.LibraryDocumentWhereInput | null {
  if (access.all) {
    return null;
  }
  return {
    scopes: {
      some: {
        OR: [{ scope_type: 'workspace' }, { scope_type: 'specialist', scope_ref: { in: access.specialists } }],
      },
    },
  };
}

function orderFor(sort: LibrarySort | undefined): Prisma.LibraryDocumentOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ created_at: 'asc' }, { id: 'asc' }];
    case 'name':
      return [{ title: 'asc' }, { id: 'asc' }];
    case 'size':
      return [{ byte_size: 'desc' }, { id: 'desc' }];
    default:
      return [{ created_at: 'desc' }, { id: 'desc' }];
  }
}

function scopeMatch(scopes: ScopeRef[]): Prisma.LibraryDocumentScopeWhereInput[] {
  return scopes.map((scope) => ({ scope_type: scope.scope_type, scope_ref: scope.scope_ref }));
}

export class PrismaLibraryDocumentRepository implements LibraryDocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewLibraryDocument): Promise<LibraryDocumentEntity> {
    const row = await activeClient(this.prisma).libraryDocument.create({
      data: {
        workspace_id: input.workspace_id,
        folder_id: input.folder_id,
        title: input.title,
        source_type: input.source_type,
        storage_key: input.storage_key,
        mime_type: input.mime_type,
        byte_size: input.byte_size,
        content_hash: input.content_hash,
        status_detail: input.status_detail === null ? Prisma.DbNull : (input.status_detail as Prisma.InputJsonValue),
        review_interval_days: input.review_interval_days,
        review_due_at: input.review_due_at,
        uploaded_at: input.uploaded_at,
        created_by: input.created_by,
        access_inherited: input.access_inherited,
        scopes: {
          create: input.scopes.map((scope) => ({
            workspace_id: input.workspace_id,
            scope_type: scope.scope_type,
            scope_ref: scope.scope_ref,
          })),
        },
      },
      include: { scopes: true },
    });
    return mapDocument(row);
  }

  async findById(workspaceId: string, id: string): Promise<LibraryDocumentEntity | null> {
    const row = await activeClient(this.prisma).libraryDocument.findFirst({
      where: { id, workspace_id: workspaceId },
      include: { scopes: true },
    });
    return row ? mapDocument(row) : null;
  }

  async list(filter: LibraryDocumentFilter): Promise<{ items: LibraryDocumentEntity[]; next_cursor: string | null }> {
    const and: Prisma.LibraryDocumentWhereInput[] = [];
    const restricted = accessFilter(filter.access);
    if (restricted) {
      and.push(restricted);
    }
    if (filter.used_by) {
      // What a specialist can really use: Everyone's documents and the ones scoped to it.
      and.push({
        scopes: { some: { OR: [{ scope_type: 'workspace' }, { scope_type: 'specialist', scope_ref: filter.used_by }] } },
      });
    }
    if (filter.scope_type) {
      and.push({
        scopes: { some: { scope_type: filter.scope_type, ...(filter.scope_ref ? { scope_ref: filter.scope_ref } : {}) } },
      });
    }

    const rows = await this.prisma.libraryDocument.findMany({
      where: {
        workspace_id: filter.workspace_id,
        // A pending upload is not a document yet.
        uploaded_at: { not: null },
        status: filter.status === 'reading' ? { in: ['queued', 'processing'] } : (filter.status ?? { not: 'deleting' }),
        ...(filter.source_type ? { source_type: filter.source_type } : {}),
        ...(filter.language ? { language: filter.language } : {}),
        ...(filter.folder_id !== undefined ? { folder_id: filter.folder_id } : {}),
        ...(filter.q ? { title: { contains: filter.q, mode: 'insensitive' as const } } : {}),
        ...(and.length > 0 ? { AND: and } : {}),
      },
      include: { scopes: true },
      orderBy: orderFor(filter.sort),
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    let next_cursor: string | null = null;
    if (rows.length > filter.limit) {
      next_cursor = rows[filter.limit - 1]?.id ?? null;
      rows.pop();
    }
    return { items: rows.map(mapDocument), next_cursor };
  }

  async update(workspaceId: string, id: string, patch: LibraryDocumentPatch): Promise<LibraryDocumentEntity> {
    // updateMany carries the workspace in the filter; a row of another workspace matches nothing.
    const result = await activeClient(this.prisma).libraryDocument.updateMany({
      where: { id, workspace_id: workspaceId },
      data: toData(patch),
    });
    const row = result.count === 1 ? await this.findById(workspaceId, id) : null;
    if (!row) {
      throw new Error('Library document not found for update');
    }
    return row;
  }

  async replaceScopes(workspaceId: string, id: string, scopes: ScopeRef[]): Promise<void> {
    const client = activeClient(this.prisma);
    const owned = await client.libraryDocument.findFirst({ where: { id, workspace_id: workspaceId }, select: { id: true } });
    if (!owned) {
      throw new Error('Library document not found for scope change');
    }
    await client.libraryDocumentScope.deleteMany({ where: { document_id: id, workspace_id: workspaceId } });
    await client.libraryDocumentScope.createMany({
      data: scopes.map((scope) => ({
        document_id: id,
        workspace_id: workspaceId,
        scope_type: scope.scope_type,
        scope_ref: scope.scope_ref,
      })),
    });
  }

  async applyIngestUpdate(
    workspaceId: string,
    id: string,
    jobId: string,
    sequence: number,
    patch: LibraryDocumentPatch,
  ): Promise<LibraryDocumentEntity | null> {
    // One conditional write: only the current job, only a higher sequence. Two
    // callbacks racing each other cannot both win, and a stale one changes nothing.
    const result = await activeClient(this.prisma).libraryDocument.updateMany({
      where: { id, workspace_id: workspaceId, ingest_job_id: jobId, last_ingest_sequence: { lt: sequence } },
      data: { ...toData(patch), last_ingest_sequence: sequence },
    });
    return result.count === 1 ? this.findById(workspaceId, id) : null;
  }

  async findDuplicate(
    workspaceId: string,
    contentHash: string,
    scopes: ScopeRef[],
    excludeId?: string,
  ): Promise<LibraryDocumentEntity | null> {
    const row = await activeClient(this.prisma).libraryDocument.findFirst({
      where: {
        workspace_id: workspaceId,
        content_hash: contentHash,
        uploaded_at: { not: null },
        status: { not: 'deleting' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        scopes: { some: { OR: scopeMatch(scopes) } },
      },
      include: { scopes: true },
      orderBy: { created_at: 'asc' },
    });
    return row ? mapDocument(row) : null;
  }

  async usage(workspaceId: string, monthStart: Date): Promise<LibraryUsage> {
    const client = activeClient(this.prisma);
    // A document being deleted still holds its storage until the delete finishes.
    const totals = await client.libraryDocument.aggregate({
      where: { workspace_id: workspaceId, uploaded_at: { not: null } },
      _count: { _all: true },
      _sum: { byte_size: true },
    });
    const ocr = await client.libraryDocument.aggregate({
      where: { workspace_id: workspaceId, uploaded_at: { not: null }, last_indexed_at: { gte: monthStart } },
      _sum: { ocr_page_count: true },
    });
    return {
      documents: totals._count._all,
      storage_bytes: totals._sum.byte_size ?? 0,
      ocr_pages_month: ocr._sum.ocr_page_count ?? 0,
    };
  }

  async summary(workspaceId: string, access: DocumentAccess): Promise<LibrarySummaryCounts> {
    const where: Prisma.LibraryDocumentWhereInput = {
      workspace_id: workspaceId,
      uploaded_at: { not: null },
      status: { not: 'deleting' },
      ...(accessFilter(access) ?? {}),
    };
    const client = activeClient(this.prisma);
    const [byStatus, byFolder] = await Promise.all([
      client.libraryDocument.groupBy({ by: ['status'], where, _count: { _all: true } }),
      client.libraryDocument.groupBy({ by: ['folder_id'], where, _count: { _all: true } }),
    ]);
    const statusCount = (...statuses: string[]) =>
      byStatus.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
    const by_folder: Record<string, number> = {};
    let in_root = 0;
    for (const row of byFolder) {
      if (row.folder_id === null) in_root = row._count._all;
      else by_folder[row.folder_id] = row._count._all;
    }
    return {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      by_status: {
        ready: statusCount('ready'),
        reading: statusCount('queued', 'processing'),
        needs_attention: statusCount('needs_attention'),
        failed: statusCount('failed'),
      },
      by_folder,
      in_root,
    };
  }

  async knowledgeCounts(workspaceId: string): Promise<LibraryKnowledgeCounts> {
    const client = activeClient(this.prisma);
    const ready: Prisma.LibraryDocumentWhereInput = {
      workspace_id: workspaceId,
      uploaded_at: { not: null },
      status: 'ready',
    };
    const [everyone, scoped] = await Promise.all([
      client.libraryDocument.count({ where: { ...ready, scopes: { some: { scope_type: 'workspace' } } } }),
      // Specialist-only documents: scoped to a specialist and not to Everyone, so a
      // document marked both counts once, in `everyone`.
      client.libraryDocumentScope.groupBy({
        by: ['scope_ref'],
        where: {
          workspace_id: workspaceId,
          scope_type: 'specialist',
          document: { ...ready, scopes: { none: { scope_type: 'workspace' } } },
        },
        _count: { _all: true },
      }),
    ]);
    return {
      everyone,
      specialist_only: Object.fromEntries(scoped.map((row) => [row.scope_ref, row._count._all])),
    };
  }

  async listInheriting(workspaceId: string, folderId: string): Promise<LibraryDocumentEntity[]> {
    // Pending uploads too: one that completes after the collection changed must not keep the old access.
    const rows = await activeClient(this.prisma).libraryDocument.findMany({
      where: { workspace_id: workspaceId, folder_id: folderId, access_inherited: true },
      include: { scopes: true },
    });
    return rows.map(mapDocument);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    // deleteMany: a concurrent second delete is a no-op instead of a P2025.
    await activeClient(this.prisma).libraryDocument.deleteMany({ where: { id, workspace_id: workspaceId } });
  }

  async listReviewDue(now: Date, limit: number): Promise<LibraryDocumentEntity[]> {
    // Raw only for the column comparison Prisma cannot express
    // (`review_reminded_at < review_due_at`); the rows are then read normally.
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "platform"."library_documents"
      WHERE review_due_at <= ${now}
        AND uploaded_at IS NOT NULL
        AND status <> 'deleting'
        AND (review_reminded_at IS NULL OR review_reminded_at < review_due_at)
      ORDER BY review_due_at ASC
      LIMIT ${limit}`;
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.libraryDocument.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: { scopes: true },
      orderBy: { review_due_at: 'asc' },
    });
    return rows.map(mapDocument);
  }
}
