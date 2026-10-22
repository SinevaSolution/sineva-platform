// Small ports the member use cases need besides the repositories.

/** One-time link tokens: 256-bit random, only the digest is ever stored. */
export interface LinkTokenService {
  generate(): { token: string; hash: string };
  hash(token: string): string;
}

/** Cuts a removed person's sessions that are tied to the workspace. */
export interface MemberSessionRevoker {
  /** @returns how many sessions were revoked. */
  revokeForWorkspace(userId: string, workspaceId: string): Promise<number>;
}

export type McpRevocationReason = 'member_removed' | 'role_changed' | 'member_left';

/**
 * Revokes a person's MCP grants and access tokens for one workspace. The MCP
 * server does not exist yet, so the only adapter is a documented no-op; the
 * use cases already call it on every removal and on role changes that drop
 * `mcp.use`, so wiring the real revoker later changes no caller.
 */
export interface McpGrantRevoker {
  revokeForMember(workspaceId: string, userId: string, reason: McpRevocationReason): Promise<void>;
}

/** The account facts the invitation flow needs, never the whole profile. */
export interface MemberAccount {
  id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  preferred_name: string | null;
  locale: string;
}

export interface MemberAccountLookup {
  findById(userId: string): Promise<MemberAccount | null>;
  /** Case-insensitive; null when no account uses the address. */
  findByEmail(email: string): Promise<MemberAccount | null>;
}

export type Clock = () => Date;
