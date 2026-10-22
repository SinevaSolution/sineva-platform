import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { JwtAuthService } from '@/server/infrastructure/auth/jwt_auth_service';
import type {
  OAuthAuthService,
  OAuthAuthSessionResult,
} from '@/server/domain/auth/oauth_auth_service';
import { generateWorkspaceSlug } from '@/server/domain/tenancy/tenant_isolation';

export class PrismaOAuthAuthService implements OAuthAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtAuthService: JwtAuthService,
  ) {}

  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    workspaceId?: string,
  ): Promise<OAuthAuthSessionResult> {
    const session = await this.jwtAuthService.createSession(
      userId,
      ipAddress,
      userAgent,
      workspaceId,
    );
    return {
      sessionId: session.sessionId,
      token: session.token,
    };
  }

  async findUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string; email_verified: boolean; full_name: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        email_verified: true,
        full_name: true,
      },
    });
    return user;
  }

  async createUserFromOAuth(data: {
    email: string;
    fullName: string;
  }): Promise<{ id: string; email: string; full_name: string }> {
    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        email_verified: true,
        email_verified_at: now,
        full_name: data.fullName,
        avatar_url: null,
        status: 'active',
        locale: 'id',
        timezone: 'Asia/Jakarta',
      },
      select: {
        id: true,
        email: true,
        full_name: true,
      },
    });
    return user;
  }

  async provisionWorkspace(userId: string, fullName: string): Promise<{ id: string; slug: string }> {
    const baseSlug = generateWorkspaceSlug(fullName);
    let finalSlug = baseSlug;
    let counter = 1;
    while (await this.prisma.workspace.findUnique({ where: { workspace_slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        workspace_name: `${fullName}'s Workspace`,
        workspace_slug: finalSlug,
        owner_user_id: userId,
        status: 'active',
        default_locale: 'id',
        timezone: 'Asia/Jakarta',
        subscription_tier: 'growth',
        monthly_token_quota: 1000000,
        monthly_tokens_consumed: 0,
      },
    });

    await this.prisma.workspaceMember.create({
      data: {
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
        specialist_scope: 'all',
      },
    });

    return {
      id: workspace.id,
      slug: workspace.workspace_slug,
    };
  }
}
