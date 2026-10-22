export interface OAuthAuthSessionResult {
  sessionId: string;
  token: string;
}

export interface OAuthAuthService {
  createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    workspaceId?: string,
  ): Promise<OAuthAuthSessionResult>;
  findUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string; email_verified: boolean; full_name: string } | null>;
  createUserFromOAuth(data: {
    email: string;
    fullName: string;
  }): Promise<{ id: string; email: string; full_name: string }>;
  provisionWorkspace(userId: string, fullName: string): Promise<{ id: string; slug: string }>;
}
