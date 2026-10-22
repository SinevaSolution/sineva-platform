import 'server-only';
import { Prisma, type PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { LibraryStatus } from '@/server/domain/library/library';
import type { LibraryIngestEventEntity } from '@/server/domain/library/library_entities';
import type {
  LibraryIngestEventRepository,
  NewLibraryIngestEvent,
} from '@/server/domain/repositories/library_repository';
import { activeClient } from './prisma_transaction_runner';

// Insert and read only. The class deliberately has no update or delete: the
// history of what sineva-ai reported is the evidence when a status looks wrong.
// Rows leave only with their document, through ON DELETE CASCADE.
export class PrismaLibraryIngestEventRepository implements LibraryIngestEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(event: NewLibraryIngestEvent): Promise<{ inserted: boolean }> {
    // createMany with skipDuplicates: a retried callback hits the unique
    // (document_id, event_id) index and is skipped without raising, which would
    // abort the surrounding transaction in Postgres.
    const result = await activeClient(this.prisma).libraryIngestEvent.createMany({
      data: [
        {
          document_id: event.document_id,
          workspace_id: event.workspace_id,
          event_id: event.event_id,
          job_id: event.job_id,
          sequence: event.sequence,
          stage: event.stage,
          outcome: event.outcome,
          status: event.status,
          detail: event.detail === null ? Prisma.DbNull : (event.detail as Prisma.InputJsonValue),
          applied: event.applied,
        },
      ],
      skipDuplicates: true,
    });
    return { inserted: result.count === 1 };
  }

  async list(workspaceId: string, documentId: string, limit: number): Promise<LibraryIngestEventEntity[]> {
    const rows = await activeClient(this.prisma).libraryIngestEvent.findMany({
      where: { workspace_id: workspaceId, document_id: documentId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      document_id: row.document_id,
      workspace_id: row.workspace_id,
      event_id: row.event_id,
      job_id: row.job_id,
      sequence: row.sequence,
      stage: row.stage,
      outcome: row.outcome,
      status: row.status as LibraryStatus | null,
      detail:
        typeof row.detail === 'object' && row.detail !== null && !Array.isArray(row.detail)
          ? (row.detail as Record<string, unknown>)
          : null,
      applied: row.applied,
      created_at: row.created_at.toISOString(),
    }));
  }
}
