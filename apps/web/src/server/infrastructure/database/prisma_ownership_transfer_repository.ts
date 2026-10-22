import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { OwnershipTransferEntity } from '@/server/domain/members/invitation';
import type {
  CreateOwnershipTransferInput,
  OwnershipTransferRepository,
} from '@/server/domain/repositories/ownership_transfer_repository';
import { validateWorkspaceId } from '@/server/domain/tenancy/tenant_isolation';
import { digestsEqual } from '@/server/infrastructure/security/sha256_link_token_service';
import { activeClient } from './prisma_transaction_runner';

interface TransferRow {
  id: string;
  workspace_id: string;
  from_user_id: string;
  to_user_id: string;
  token_hash: string;
  expires_at: Date;
  accepted_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

function mapTransfer(row: TransferRow): OwnershipTransferEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    from_user_id: row.from_user_id,
    to_user_id: row.to_user_id,
    expires_at: row.expires_at.toISOString(),
    accepted_at: row.accepted_at?.toISOString() ?? null,
    cancelled_at: row.cancelled_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

const OPEN = { accepted_at: null, cancelled_at: null } as const;

export class PrismaOwnershipTransferRepository implements OwnershipTransferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return activeClient(this.prisma);
  }

  async createPending(
    workspaceId: string,
    input: CreateOwnershipTransferInput,
  ): Promise<{ transfer: OwnershipTransferEntity; replaced_transfer_id: string | null }> {
    validateWorkspaceId(workspaceId);
    const db = this.db;
    // The partial unique index allows one open row, so the earlier one is
    // closed first. Callers hold the workspace lock, which keeps this pair of
    // statements from interleaving with another request.
    const previous = await db.ownershipTransfer.findFirst({
      where: { workspace_id: workspaceId, ...OPEN },
      select: { id: true },
    });
    if (previous) {
      await db.ownershipTransfer.update({
        where: { id: previous.id },
        data: { cancelled_at: new Date(), updated_at: new Date() },
      });
    }
    const row = await db.ownershipTransfer.create({
      data: {
        workspace_id: workspaceId,
        from_user_id: input.from_user_id,
        to_user_id: input.to_user_id,
        token_hash: input.token_hash,
        expires_at: input.expires_at,
      },
    });
    return { transfer: mapTransfer(row), replaced_transfer_id: previous?.id ?? null };
  }

  async findOpen(workspaceId: string): Promise<OwnershipTransferEntity | null> {
    validateWorkspaceId(workspaceId);
    const row = await this.db.ownershipTransfer.findFirst({
      where: { workspace_id: workspaceId, ...OPEN },
    });
    return row ? mapTransfer(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<OwnershipTransferEntity | null> {
    const row = await this.db.ownershipTransfer.findUnique({ where: { token_hash: tokenHash } });
    if (!row || !digestsEqual(tokenHash, row.token_hash)) {
      return null;
    }
    return mapTransfer(row);
  }

  async cancel(workspaceId: string, transferId: string, at: Date): Promise<boolean> {
    validateWorkspaceId(workspaceId);
    const result = await this.db.ownershipTransfer.updateMany({
      where: { id: transferId, workspace_id: workspaceId, ...OPEN },
      data: { cancelled_at: at, updated_at: at },
    });
    return result.count === 1;
  }

  async claim(transferId: string, at: Date): Promise<boolean> {
    const result = await this.db.ownershipTransfer.updateMany({
      where: { id: transferId, ...OPEN },
      data: { accepted_at: at, updated_at: at },
    });
    return result.count === 1;
  }
}
