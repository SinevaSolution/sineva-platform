import type { AuditEvent, AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole, WorkspaceMemberEntity } from '@/server/domain/entities/user';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import type {
  InvitationEntity,
  OwnershipTransferEntity,
} from '@/server/domain/members/invitation';
import type {
  Clock,
  McpGrantRevoker,
  McpRevocationReason,
  MemberAccount,
  MemberAccountLookup,
  MemberSessionRevoker,
} from '@/server/domain/members/member_ports';
import type {
  InvitationRepository,
  UpsertPendingInvitationInput,
} from '@/server/domain/repositories/invitation_repository';
import type {
  CreateOwnershipTransferInput,
  OwnershipTransferRepository,
} from '@/server/domain/repositories/ownership_transfer_repository';
import type {
  AddMemberInput,
  MemberDirectoryEntry,
  WorkspaceMemberRepository,
} from '@/server/domain/repositories/workspace_member_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { Sha256LinkTokenService } from '@/server/infrastructure/security/sha256_link_token_service';
import { FakeEmailSender } from '@/server/infrastructure/email/fake_email_sender';
import { renderEmailTemplate } from '@/server/application/email/templates';
import type { EntitlementKey, EntitlementService } from '@/server/domain/entitlements/entitlements';

export const WS = '11111111-1111-4111-8111-111111111111';
export const OTHER_WS = '22222222-2222-4222-8222-222222222222';

interface WorldState {
  users: Map<string, MemberAccount & { phone_number: string | null; avatar_url: string | null }>;
  workspaces: Map<string, WorkspaceEntity>;
  members: WorkspaceMemberEntity[];
  allowlists: Map<string, string[]>;
  invitations: InvitationEntity[];
  transfers: OwnershipTransferEntity[];
  sessions: Array<{ id: string; user_id: string; active_workspace_id: string | null; revoked_at: Date | null }>;
  audit: AuditEvent[];
  mcp: Array<{ workspace_id: string; user_id: string; reason: McpRevocationReason }>;
  emailCount: number;
}

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

/**
 * In-memory stand-in for the database behind every member port, with
 * transactional rollback: `transactions.run` snapshots the whole world and
 * restores it when the work throws, which is what lets the tests prove "one
 * transaction" (a failure after a write leaves nothing behind, audit included).
 */
export class MembersWorld {
  state: WorldState = {
    users: new Map(),
    workspaces: new Map(),
    members: [],
    allowlists: new Map(),
    invitations: [],
    transfers: [],
    sessions: [],
    audit: [],
    mcp: [],
    emailCount: 0,
  };
  now = new Date('2026-10-22T08:00:00.000Z');
  clock: Clock = () => new Date(this.now.getTime());
  tokens = new Sha256LinkTokenService();
  emails = new FakeEmailSender(renderEmailTemplate);
  /** Entitlement keys asserted, in order. */
  entitlementChecks: EntitlementKey[] = [];
  failAuditAfter: number | null = null;
  locks = 0;

  advance(ms: number): void {
    this.now = new Date(this.now.getTime() + ms);
  }

  addUser(
    id: string,
    email: string,
    opts: { verified?: boolean; name?: string; locale?: string } = {},
  ): void {
    this.state.users.set(id, {
      id,
      email,
      email_verified: opts.verified ?? true,
      full_name: opts.name ?? `User ${id.slice(-2)}`,
      preferred_name: null,
      locale: opts.locale ?? 'en',
      phone_number: null,
      avatar_url: null,
    });
  }

  addWorkspace(id = WS, ownerUserId: string | null = null): void {
    this.state.workspaces.set(id, {
      id,
      workspace_slug: `ws-${id.slice(0, 4)}`,
      workspace_name: 'Warung Sari',
      owner_user_id: ownerUserId,
      status: 'active',
      status_reason: null,
      trial_ends_at: null,
      timezone: 'Asia/Jakarta',
      default_locale: 'en',
      logo_url: null,
      slug_changed_at: null,
      subscription_tier: 'growth',
      monthly_token_quota: 0,
      monthly_tokens_consumed: 0,
      created_at: this.now.toISOString(),
      updated_at: this.now.toISOString(),
    });
  }

  addMember(
    workspaceId: string,
    userId: string,
    role: UserRole,
    scope: 'all' | 'selected' = 'all',
    slugs: string[] = [],
  ): WorkspaceMemberEntity {
    const member: WorkspaceMemberEntity = {
      id: nextId(),
      workspace_id: workspaceId,
      user_id: userId,
      role,
      specialist_scope: scope,
      job_title: null,
      department: null,
      created_at: this.now.toISOString(),
      updated_at: this.now.toISOString(),
    };
    this.state.members.push(member);
    if (slugs.length) this.state.allowlists.set(member.id, [...slugs]);
    return member;
  }

  addSession(userId: string, activeWorkspaceId: string | null): string {
    const id = nextId();
    this.state.sessions.push({ id, user_id: userId, active_workspace_id: activeWorkspaceId, revoked_at: null });
    return id;
  }

  memberOf(workspaceId: string, userId: string): WorkspaceMemberEntity | undefined {
    return this.state.members.find((m) => m.workspace_id === workspaceId && m.user_id === userId);
  }

  ownerCount(workspaceId: string): number {
    return this.state.members.filter((m) => m.workspace_id === workspaceId && m.role === 'owner').length;
  }

  ctx(userId: string, role: UserRole, workspaceId = WS): RequestContext {
    return {
      user_id: userId,
      workspace_id: workspaceId,
      role,
      session_id: `sess-${userId}`,
      request_id: 'req-test-0001',
      actor: { type: 'user', id: userId },
    };
  }

  actions(): string[] {
    return this.state.audit.map((e) => e.action);
  }

  /** The plain token out of the last invitation or transfer email (the link is the only carrier). */
  lastLinkToken(): string {
    const last = this.emails.getLastEmail();
    const url = String(last?.params.url ?? '');
    return url.split('/').pop() ?? '';
  }

  // ---- ports -------------------------------------------------------------

  // Transactions run one after another, which is what the workspace row lock
  // and the claim guards guarantee the real database. Without it, a rollback
  // snapshot taken by one concurrent call would erase the other's writes.
  private queue: Promise<unknown> = Promise.resolve();

  transactions: TransactionRunner = {
    run: <T>(work: () => Promise<T>): Promise<T> => {
      const result = this.queue.then(() => this.runIsolated(work));
      this.queue = result.catch(() => undefined);
      return result;
    },
  };

  private async runIsolated<T>(work: () => Promise<T>): Promise<T> {
    {
      const snapshot = {
        members: structuredClone(this.state.members),
        allowlists: structuredClone(this.state.allowlists),
        invitations: structuredClone(this.state.invitations),
        transfers: structuredClone(this.state.transfers),
        sessions: structuredClone(this.state.sessions),
        audit: [...this.state.audit],
        workspaces: structuredClone(this.state.workspaces),
        mcp: [...this.state.mcp],
      };
      try {
        return await work();
      } catch (error) {
        Object.assign(this.state, snapshot);
        throw error;
      }
    }
  }

  audit: AuditLogger = {
    log: async (event: AuditEvent) => {
      if (this.failAuditAfter !== null && this.state.audit.length >= this.failAuditAfter) {
        throw new Error('audit write failed');
      }
      this.state.audit.push(event);
    },
  };

  entitlements: EntitlementService = {
    check: async () => ({ allowed: true, reason: 'open' }),
    assert: async (_ws, key) => {
      this.entitlementChecks.push(key);
    },
  };

  accounts: MemberAccountLookup = {
    findById: async (id) => this.state.users.get(id) ?? null,
    findByEmail: async (email) =>
      [...this.state.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
  };

  workspaces = {
    findById: async (id: string) => this.state.workspaces.get(id) ?? null,
  } as unknown as WorkspaceRepository;

  sessionRevoker: MemberSessionRevoker = {
    revokeForWorkspace: async (userId, workspaceId) => {
      let count = 0;
      for (const s of this.state.sessions) {
        if (s.user_id === userId && s.active_workspace_id === workspaceId && !s.revoked_at) {
          s.revoked_at = this.now;
          count += 1;
        }
      }
      return count;
    },
  };

  mcpRevoker: McpGrantRevoker = {
    revokeForMember: async (workspace_id, user_id, reason) => {
      this.state.mcp.push({ workspace_id, user_id, reason });
    },
  };

  members: WorkspaceMemberRepository = {
    findMembership: async (ws, userId) => this.memberOf(ws, userId) ?? null,
    listMembers: async (ws) => this.state.members.filter((m) => m.workspace_id === ws),
    findById: async (ws, id) => this.state.members.find((m) => m.workspace_id === ws && m.id === id) ?? null,
    listDirectory: async (ws) =>
      this.state.members.filter((m) => m.workspace_id === ws).map((m) => this.entry(m)),
    getDirectoryEntry: async (ws, id) => {
      const m = this.state.members.find((x) => x.workspace_id === ws && x.id === id);
      return m ? this.entry(m) : null;
    },
    addMember: async (ws, input: AddMemberInput) => {
      if (this.state.members.some((m) => m.workspace_id === ws && m.user_id === input.user_id)) {
        throw new Error('unique violation: (workspace_id, user_id)');
      }
      if (input.role === 'owner' && this.ownerCount(ws) > 0) {
        throw new Error('unique violation: one owner per workspace');
      }
      const member = this.addMember(
        ws,
        input.user_id,
        input.role,
        input.specialist_scope ?? 'all',
        input.specialist_scope === 'selected' ? (input.specialist_slugs ?? []) : [],
      );
      return member;
    },
    updateRole: async (ws, id, role) => {
      const m = this.state.members.find((x) => x.workspace_id === ws && x.id === id);
      if (!m) throw new NotFoundError('Workspace member', id);
      if (role === 'owner' && this.ownerCount(ws) > 0 && m.role !== 'owner') {
        throw new Error('unique violation: one owner per workspace');
      }
      m.role = role;
      return { ...m };
    },
    updateAccess: async (ws, id, access) => {
      const m = this.state.members.find((x) => x.workspace_id === ws && x.id === id);
      if (!m) throw new NotFoundError('Workspace member', id);
      m.specialist_scope = access.specialist_scope;
      if (access.specialist_scope === 'selected') {
        this.state.allowlists.set(m.id, [...access.specialist_slugs]);
      } else {
        this.state.allowlists.delete(m.id);
      }
      return { ...m };
    },
    removeMember: async (ws, id) => {
      this.state.members = this.state.members.filter((m) => !(m.workspace_id === ws && m.id === id));
      this.state.allowlists.delete(id);
    },
    lockWorkspace: async () => {
      this.locks += 1;
    },
    swapOwner: async (ws, fromUserId, toUserId) => {
      const from = this.memberOf(ws, fromUserId);
      const to = this.memberOf(ws, toUserId);
      if (!from || !to || from.role !== 'owner' || to.role !== 'admin') return false;
      from.role = 'admin';
      to.role = 'owner';
      const workspace = this.state.workspaces.get(ws);
      if (workspace) workspace.owner_user_id = toUserId;
      return true;
    },
    updateOwnAttributes: async (): Promise<WorkspaceMemberEntity> => {
      throw new Error('not used by the member use cases');
    },
  };

  invitations: InvitationRepository = {
    upsertPending: async (ws, input: UpsertPendingInvitationInput) => {
      const existing = this.state.invitations.find(
        (i) => i.workspace_id === ws && i.email === input.email && !i.accepted_at && !i.revoked_at,
      );
      if (existing) {
        Object.assign(existing, {
          role: input.role,
          inviter_user_id: input.inviter_user_id,
          specialist_scope: input.specialist_scope,
          specialist_slugs: input.specialist_slugs,
          token_hash: input.token_hash,
          expires_at: input.expires_at.toISOString(),
          last_sent_at: input.sent_at.toISOString(),
          expired_logged_at: null,
        });
        return { invitation: this.publicInvitation(existing), replaced: true };
      }
      const row = {
        id: nextId(),
        workspace_id: ws,
        email: input.email,
        role: input.role,
        inviter_user_id: input.inviter_user_id,
        specialist_scope: input.specialist_scope,
        specialist_slugs: input.specialist_slugs,
        token_hash: input.token_hash,
        expires_at: input.expires_at.toISOString(),
        accepted_at: null,
        revoked_at: null,
        expired_logged_at: null,
        last_sent_at: input.sent_at.toISOString(),
        created_at: input.sent_at.toISOString(),
      };
      this.tokenHashes.set(row.id, input.token_hash);
      this.state.invitations.push(row as unknown as InvitationEntity);
      return { invitation: this.publicInvitation(row as unknown as InvitationEntity), replaced: false };
    },
    findByTokenHash: async (hash) => {
      const row = this.state.invitations.find((i) => this.hashOf(i) === hash);
      return row ? this.publicInvitation(row) : null;
    },
    findById: async (ws, id) => {
      const row = this.state.invitations.find((i) => i.workspace_id === ws && i.id === id);
      return row ? this.publicInvitation(row) : null;
    },
    listOpen: async (ws) =>
      this.state.invitations
        .filter((i) => i.workspace_id === ws && !i.accepted_at && !i.revoked_at)
        .map((i) => this.publicInvitation(i)),
    replaceToken: async (ws, id, hash, expiresAt, sentAt) => {
      const row = this.state.invitations.find((i) => i.workspace_id === ws && i.id === id);
      if (!row) throw new NotFoundError('Invitation', id);
      (row as unknown as { token_hash: string }).token_hash = hash;
      row.expires_at = expiresAt.toISOString();
      row.last_sent_at = sentAt.toISOString();
      row.expired_logged_at = null;
      return this.publicInvitation(row);
    },
    revoke: async (ws, id, at) => {
      const row = this.state.invitations.find((i) => i.workspace_id === ws && i.id === id);
      if (!row || row.accepted_at || row.revoked_at) return false;
      row.revoked_at = at.toISOString();
      return true;
    },
    claimAcceptance: async (id, at) => {
      const row = this.state.invitations.find((i) => i.id === id);
      if (!row || row.accepted_at || row.revoked_at) return false;
      row.accepted_at = at.toISOString();
      return true;
    },
    markExpiredLogged: async (id, at) => {
      const row = this.state.invitations.find((i) => i.id === id);
      if (!row || row.expired_logged_at) return false;
      row.expired_logged_at = at.toISOString();
      return true;
    },
  };

  transfers: OwnershipTransferRepository = {
    createPending: async (ws, input: CreateOwnershipTransferInput) => {
      let replaced: string | null = null;
      for (const t of this.state.transfers) {
        if (t.workspace_id === ws && !t.accepted_at && !t.cancelled_at) {
          t.cancelled_at = this.now.toISOString();
          replaced = t.id;
        }
      }
      const row = {
        id: nextId(),
        workspace_id: ws,
        from_user_id: input.from_user_id,
        to_user_id: input.to_user_id,
        token_hash: input.token_hash,
        expires_at: input.expires_at.toISOString(),
        accepted_at: null,
        cancelled_at: null,
        created_at: this.now.toISOString(),
      };
      this.state.transfers.push(row as unknown as OwnershipTransferEntity);
      return { transfer: this.publicTransfer(row as unknown as OwnershipTransferEntity), replaced_transfer_id: replaced };
    },
    findOpen: async (ws) => {
      const row = this.state.transfers.find((t) => t.workspace_id === ws && !t.accepted_at && !t.cancelled_at);
      return row ? this.publicTransfer(row) : null;
    },
    findByTokenHash: async (hash) => {
      const row = this.state.transfers.find(
        (t) => (t as unknown as { token_hash: string }).token_hash === hash,
      );
      return row ? this.publicTransfer(row) : null;
    },
    cancel: async (ws, id, at) => {
      const row = this.state.transfers.find((t) => t.workspace_id === ws && t.id === id);
      if (!row || row.accepted_at || row.cancelled_at) return false;
      row.cancelled_at = at.toISOString();
      return true;
    },
    claim: async (id, at) => {
      const row = this.state.transfers.find((t) => t.id === id);
      if (!row || row.accepted_at || row.cancelled_at) return false;
      row.accepted_at = at.toISOString();
      return true;
    },
  };

  /** Raw digest of a stored invitation, so tests can assert that no plain token is stored. */
  storedTokenHashes(): string[] {
    return [
      ...this.state.invitations.map((i) => this.hashOf(i)),
      ...this.state.transfers.map((t) => (t as unknown as { token_hash: string }).token_hash),
    ];
  }

  private tokenHashes = new Map<string, string>();

  private hashOf(invitation: InvitationEntity): string {
    return (invitation as unknown as { token_hash: string }).token_hash;
  }

  // Entities returned to use cases never carry the digest, like the real adapter's mapping.
  private publicInvitation(row: InvitationEntity): InvitationEntity {
    const { token_hash: _digest, ...rest } = row as unknown as InvitationEntity & { token_hash?: string };
    void _digest;
    return { ...rest, specialist_slugs: [...rest.specialist_slugs] };
  }

  private publicTransfer(row: OwnershipTransferEntity): OwnershipTransferEntity {
    const { token_hash: _digest, ...rest } = row as unknown as OwnershipTransferEntity & { token_hash?: string };
    void _digest;
    return { ...rest };
  }

  private entry(member: WorkspaceMemberEntity): MemberDirectoryEntry {
    const user = this.state.users.get(member.user_id);
    return {
      member: { ...member },
      user: {
        full_name: user?.full_name ?? 'Former member',
        preferred_name: user?.preferred_name ?? null,
        email: user?.email ?? '',
        phone_number: user?.phone_number ?? null,
        avatar_url: user?.avatar_url ?? null,
        last_active_at: null,
      },
      specialist_slugs: [...(this.state.allowlists.get(member.id) ?? [])],
    };
  }
}

/** A workspace with an owner, an admin, a member and a viewer, all verified. */
export function seededWorld(): MembersWorld {
  const world = new MembersWorld();
  world.addWorkspace(WS, USERS.owner);
  world.addUser(USERS.owner, 'owner@acme.test', { name: 'Sari Wulandari' });
  world.addUser(USERS.admin, 'admin@acme.test', { name: 'Adi Admin' });
  world.addUser(USERS.member, 'member@acme.test', { name: 'Mira Member' });
  world.addUser(USERS.viewer, 'viewer@acme.test', { name: 'Vino Viewer' });
  world.addMember(WS, USERS.owner, 'owner');
  world.addMember(WS, USERS.admin, 'admin');
  world.addMember(WS, USERS.member, 'member');
  world.addMember(WS, USERS.viewer, 'viewer');
  return world;
}

export const USERS = {
  owner: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  admin: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  member: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
  viewer: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
  stranger: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009',
} as const;
