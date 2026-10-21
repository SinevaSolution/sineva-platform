import type { OAuthProfile } from '@/server/domain/auth/oauth_provider';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type {
  OAuthAuthService,
  OAuthAuthSessionResult,
} from '@/server/domain/auth/oauth_auth_service';
import type { AccountRepository } from '@/server/domain/repositories/account_repository';
import { ConflictError, ForbiddenError } from '@/server/domain/errors/domain_error';

export interface OAuthSignInInput {
  profile: OAuthProfile;
  ipAddress?: string;
  userAgent?: string;
}

export interface OAuthSignInResult {
  userId: string;
  session: OAuthAuthSessionResult;
  isNewUser: boolean;
  isLinked?: boolean;
}

export class OAuthSignInUseCase {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly authService: OAuthAuthService,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: OAuthSignInInput): Promise<OAuthSignInResult> {
    const { profile, ipAddress, userAgent } = input;
    const normalizedEmail = profile.email.trim().toLowerCase();

    // 1. Check if an account already exists for (provider_id, account_id)
    const existingEntry = await this.accountRepo.findByProviderAndAccountId(
      profile.provider,
      profile.provider_account_id,
    );

    if (existingEntry) {
      const user = existingEntry.user;
      if (user.status === 'suspended' || user.status === 'deleted') {
        throw new ForbiddenError(`User account is ${user.status}`);
      }

      const session = await this.authService.createSession(
        user.id,
        ipAddress,
        userAgent,
      );

      await this.auditLogger.log({
        action: 'user.signed_in',
        context: {
          user_id: user.id,
          session_id: session.sessionId,
          request_id: 'oauth_sign_in',
        },
        metadata: {
          provider: profile.provider,
          auth_method: 'oauth',
        },
      });

      return {
        userId: user.id,
        session,
        isNewUser: false,
      };
    }

    // 2. Account does not exist. Check if user with normalizedEmail exists
    const existingUser = await this.authService.findUserByEmail(normalizedEmail);

    if (existingUser) {
      // PRE-HIJACKING DEFENSE (FR-AUTH-01c):
      // A new OAuth sign-in whose verified email matches an existing user links ONLY
      // if that existing user's email is verified too.
      if (!existingUser.email_verified) {
        throw new ConflictError(
          'Account',
          'An unverified account already exists with this email address. Please sign in with your password to verify your email first, then link your OAuth account from Account Settings.',
        );
      }

      // Link OAuth account to existing verified user
      await this.accountRepo.create({
        user_id: existingUser.id,
        provider_id: profile.provider,
        account_id: profile.provider_account_id,
        provider_email: profile.email,
        provider_username: profile.username ?? null,
      });

      const session = await this.authService.createSession(
        existingUser.id,
        ipAddress,
        userAgent,
      );

      await this.auditLogger.log({
        action: 'user.oauth_linked',
        context: {
          user_id: existingUser.id,
          session_id: session.sessionId,
          request_id: 'oauth_link',
        },
        metadata: {
          provider: profile.provider,
          provider_account_id: profile.provider_account_id,
        },
      });

      await this.auditLogger.log({
        action: 'user.signed_in',
        context: {
          user_id: existingUser.id,
          session_id: session.sessionId,
          request_id: 'oauth_sign_in',
        },
        metadata: {
          provider: profile.provider,
          auth_method: 'oauth',
          linked: true,
        },
      });

      return {
        userId: existingUser.id,
        session,
        isNewUser: false,
        isLinked: true,
      };
    }

    // 3. User does not exist: create user, account, and provisional workspace
    const fullName = profile.full_name || profile.username || 'User';

    const newUser = await this.authService.createUserFromOAuth({
      email: normalizedEmail,
      fullName,
    });

    await this.accountRepo.create({
      user_id: newUser.id,
      provider_id: profile.provider,
      account_id: profile.provider_account_id,
      provider_email: profile.email,
      provider_username: profile.username ?? null,
    });

    const workspace = await this.authService.provisionWorkspace(newUser.id, fullName);

    const session = await this.authService.createSession(
      newUser.id,
      ipAddress,
      userAgent,
      workspace.id,
    );

    await this.auditLogger.log({
      action: 'user.signed_up',
      context: {
        user_id: newUser.id,
        session_id: session.sessionId,
        request_id: 'oauth_sign_up',
      },
      metadata: {
        provider: profile.provider,
      },
    });

    await this.auditLogger.log({
      action: 'user.oauth_linked',
      context: {
        user_id: newUser.id,
        session_id: session.sessionId,
        request_id: 'oauth_sign_up',
      },
      metadata: {
        provider: profile.provider,
      },
    });

    await this.auditLogger.log({
      action: 'workspace.created',
      context: {
        user_id: newUser.id,
        workspace_id: workspace.id,
        session_id: session.sessionId,
        request_id: 'oauth_sign_up',
      },
      metadata: {
        workspace_id: workspace.id,
        workspace_slug: workspace.slug,
        provisional: true,
      },
    });

    await this.auditLogger.log({
      action: 'user.signed_in',
      context: {
        user_id: newUser.id,
        session_id: session.sessionId,
        request_id: 'oauth_sign_in',
      },
      metadata: {
        provider: profile.provider,
        auth_method: 'oauth',
      },
    });

    return {
      userId: newUser.id,
      session,
      isNewUser: true,
    };
  }
}
