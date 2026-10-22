import 'server-only';
import { Prisma, type PrismaClient } from '@/server/infrastructure/database/generated/client';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type { LibraryFolderEntity } from '@/server/domain/library/library_entities';
import type { LibraryFolderRepository, NewLibraryFolder } from '@/server/domain/repositories/library_repository';
import { activeClient } from './prisma_transaction_runner';

function mapFolder(row: {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}): LibraryFolderEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    parent_id: row.parent_id,
    name: row.name,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class PrismaLibraryFolderRepository implements LibraryFolderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewLibraryFolder): Promise<LibraryFolderEntity> {
    try {
      const row = await activeClient(this.prisma).libraryFolder.create({
        data: {
          workspace_id: input.workspace_id,
          parent_id: input.parent_id,
          // The unique index runs over a column that is never null (see the schema comment).
          parent_key: input.parent_id ?? input.workspace_id,
          name: input.name,
          created_by: input.created_by,
        },
      });
      return mapFolder(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Library folder', input.name);
      }
      throw error;
    }
  }

  async findById(workspaceId: string, id: string): Promise<LibraryFolderEntity | null> {
    const row = await activeClient(this.prisma).libraryFolder.findFirst({ where: { id, workspace_id: workspaceId } });
    return row ? mapFolder(row) : null;
  }

  async listAll(workspaceId: string): Promise<LibraryFolderEntity[]> {
    const rows = await activeClient(this.prisma).libraryFolder.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapFolder);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { name?: string; parent_id?: string | null },
  ): Promise<LibraryFolderEntity> {
    try {
      const result = await activeClient(this.prisma).libraryFolder.updateMany({
        where: { id, workspace_id: workspaceId },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.parent_id !== undefined
            ? { parent_id: patch.parent_id, parent_key: patch.parent_id ?? workspaceId }
            : {}),
          // `updated_at` does not update itself (known debt).
          updated_at: new Date(),
        },
      });
      const row = result.count === 1 ? await this.findById(workspaceId, id) : null;
      if (!row) {
        throw new Error('Library folder not found for update');
      }
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Library folder', patch.name ?? id);
      }
      throw error;
    }
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    // The foreign keys are NO ACTION: a folder that gained content since the
    // use case counted it fails here instead of deleting anything.
    await activeClient(this.prisma).libraryFolder.deleteMany({ where: { id, workspace_id: workspaceId } });
  }

  async contentCounts(workspaceId: string, id: string): Promise<{ folders: number; documents: number }> {
    const client = activeClient(this.prisma);
    const [folders, documents] = await Promise.all([
      client.libraryFolder.count({ where: { workspace_id: workspaceId, parent_id: id } }),
      // A pending upload in the folder is not a document, but it still blocks the delete
      // through the foreign key, so it counts here too.
      client.libraryDocument.count({ where: { workspace_id: workspaceId, folder_id: id } }),
    ]);
    return { folders, documents };
  }
}
