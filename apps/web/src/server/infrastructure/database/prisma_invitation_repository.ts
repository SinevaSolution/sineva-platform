import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { UserRole } from '@/server/domain/entities/user';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { InvitationEntity } from '@/server/domain/members/invitation';
import type {
  InvitationRepository,
  UpsertPendingInvitationInput,
} from '@/server/domain/repositories/invitation_repository';
import { validateWorkspaceId } from '@/server/domain/tenancy/tenant_isolation';
import { digestsEqual } from '@/server/infrastructure/security/sha256_link_token_service';
import { activeClient } from './prisma_transaction_runner';

interface InvitationRow {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  inviter_user_id: string;
  specialist_scope: string;
  scope_agent_slugs: string[];
  token_hash: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  expired_logged_at: Date | null;
  last_sent_at: Date;
  created_at: Date;
}

// The digest is a lookup key only: it never leaves this adapter, so no use
// case result, audit payload or response can carry it.
function mapInvitation(row: InvitationRow): InvitationEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    email: row.email,
    role: row.role as UserRole,
    inviter_user_id: row.inviter_user_id,
    specialist_scope: row.specialist_scope === 'selected' ? 'selected' : 'all',
    specialist_slugs: row.scope_agent_slugs ?? [],
    expires_at: row.expires_at.toISOString(),
    accepted_at: row.accepted_at?.toISOString() ?? null,
    revoked_at: row.revoked_at?.toISOString() ?? null,
    expired_logged_at: row.expired_logged_at?.toISOString() ?? null,
    last_sent_at: row.last_sent_at.toISOString(),
    created_at: row.created_at.toISOString(),
  };
}

const OPEN = { accepted_at: null, revoked_at: null } as const;

export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return activeClient(this.prisma);
  }

  async upsertPending(
    workspaceId: string,
    input: UpsertPendingInvitationInput,
  ): Promise<{ invitation: InvitationEntity; replaced: boolean }> {
    validateWorkspaceId(workspaceId);
    const email = input.email.toLowerCase();
    const fields = {
      role: input.role,
      inviter_user_id: input.inviter_user_id,
      specialist_scope: input.specialist_scope,
      scope_agent_slugs: input.specialist_scope === 'selected' ? input.specialist_slugs : [],
      token_hash: input.token_hash,
      expires_at: input.expires_at,
      last_sent_at: input.sent_at,
      expired_logged_at: null,
      updated_at: input.sent_at,
    };
    const db = this.db;
    // The partial unique index (workspace, lower(email)) where open makes this
    // read-then-write safe: two racing invites for one address cannot both insert.
    const existing = await db.workspaceInvitation.findFirst({
      where: { workspace_id: workspaceId, email: { equals: email, mode: 'insensitive' }, ...OPEN },
      select: { id: true },
    });
    if (existing) {
      const row = await db.workspaceInvitation.update({ where: { id: existing.id }, data: fields });
      return { invitation: mapInvitation(row as InvitationRow), replaced: true };
    }
    const row = await db.workspaceInvitation.create({
      data: { workspace_id: workspaceId, email, created_at: input.sent_at, ...fields },
    });
    return { invitation: mapInvitation(row as InvitationRow), replaced: false };
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationEntity | null> {
    const row = await this.db.workspaceInvitation.findUnique({ where: { token_hash: tokenHash } });
    if (!row || !digestsEqual(tokenHash, row.token_hash)) {
      return null;
    }
    return mapInvitation(row as InvitationRow);
  }

  async findById(workspaceId: string, invitationId: string): Promise<InvitationEntity | null> {
    validateWorkspaceId(workspaceId);
    const row = await this.db.workspaceInvitation.findFirst({
      where: { id: invitationId, workspace_id: workspaceId },
    });
    return row ? mapInvitation(row as InvitationRow) : null;
  }

  async listOpen(workspaceId: string): Promise<InvitationEntity[]> {
    validateWorkspaceId(workspaceId);
    const rows = await this.db.workspaceInvitation.findMany({
      where: { workspace_id: workspaceId, ...OPEN },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((row) => mapInvitation(row as InvitationRow));
  }

  async replaceToken(
    workspaceId: string,
    invitationId: string,
    tokenHash: string,
    expiresAt: Date,
    sentAt: Date,
  ): Promise<InvitationEntity> {
    validateWorkspaceId(workspaceId);
    const result = await this.db.workspaceInvitation.updateMany({
      where: { id: invitationId, workspace_id: workspaceId, ...OPEN },
      data: {
        token_hash: tokenHash,
        expires_at: expiresAt,
        last_sent_at: sentAt,
        expired_logged_at: null,
        updated_at: sentAt,
      },
    });
    if (result.count === 0) {
      throw new NotFoundError('Invitation', invitationId);
    }
    const row = await this.db.workspaceInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    return mapInvitation(row as InvitationRow);
  }

  async revoke(workspaceId: string, invitationId: string, at: Date): Promise<boolean> {
    validateWorkspaceId(workspaceId);
    const result = await this.db.workspaceInvitation.updateMany({
      where: { id: invitationId, workspace_id: workspaceId, ...OPEN },
      data: { revoked_at: at, updated_at: at },
    });
    return result.count === 1;
  }

  async claimAcceptance(invitationId: string, at: Date): Promise<boolean> {
    // One conditional UPDATE: the row lock makes concurrent accepts queue and
    // only the first still sees an open row.
    const result = await this.db.workspaceInvitation.updateMany({
      where: { id: invitationId, ...OPEN },
      data: { accepted_at: at, updated_at: at },
    });
    return result.count === 1;
  }

  async markExpiredLogged(invitationId: string, at: Date): Promise<boolean> {
    const result = await this.db.workspaceInvitation.updateMany({
      where: { id: invitationId, expired_logged_at: null },
      data: { expired_logged_at: at, updated_at: at },
    });
    return result.count === 1;
  }
}
