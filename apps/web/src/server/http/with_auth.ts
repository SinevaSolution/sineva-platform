import type { NextRequest, NextResponse } from 'next/server';
import {
  type PermissionKey,
  hasPermission,
} from '@/server/domain/permissions/registry';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@/server/domain/errors/domain_error';
import { verifyCsrf } from '@/server/http/csrf_guard';
import { extractRequestId, handleRouteError, sendErrorJson } from '@/server/http/response_helper';
import { getEnvConfig } from '@/server/infrastructure/config/env';
import { getPrismaClient, getJwtAuthService } from '@/server/container';

// First hop of X-Forwarded-For when a proxy set it, else X-Real-IP. Only used
// to label audit rows (truncated on write), never for an access decision, so
// a spoofed header can mislabel a row but cannot grant anything.
function clientIp(request?: NextRequest): string | undefined {
  const forwarded = request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request?.headers?.get('x-real-ip') || undefined;
}

export interface RouteAuthOptions {
  permission?: PermissionKey;
  scope: 'workspace' | 'user' | 'public';
  requireFreshSession?: boolean;
  requiredStaffRole?: 'operator' | 'platform_admin';
  allowInternalApiKey?: boolean;
  requiredRoleOrInternal?: 'owner' | 'admin';
  specialistSlugExtractor?: (
    request: NextRequest,
    params?: Record<string, string | string[]>,
  ) => string | undefined;
}

export type AuthenticatedHandler<TParams = Record<string, string | string[]>> = (
  request: NextRequest,
  context: {
    requestContext: RequestContext;
    params?: TParams;
  },
) => Promise<NextResponse>;

export interface ResolvedSession {
  userId: string;
  sessionId: string;
  role?: UserRole;
  freshUntil?: Date | null;
  staffRole?: 'operator' | 'platform_admin' | 'support' | null;
  emailVerified?: boolean;
  memberships: Array<{
    workspaceId: string;
    role: UserRole;
    specialistScope: 'all' | 'selected';
    allowedSpecialists?: string[];
  }>;
}

// In-process override of session resolution for route tests. It is a function
// seam rather than request-driven (a header or an env flag) on purpose: anything
// a caller can send is reachable in production, so it would be an auth bypass.
export type SessionResolver = (
  request?: NextRequest,
) => Promise<ResolvedSession | null>;

let customSessionResolver: SessionResolver | null = null;

export function setCustomSessionResolver(resolver: SessionResolver | null): void {
  if (process.env.NODE_ENV === 'production' && resolver) {
    throw new Error('setCustomSessionResolver is not available in production');
  }
  customSessionResolver = resolver;
}

export async function resolveSession(request?: NextRequest): Promise<ResolvedSession | null> {
  if (customSessionResolver) {
    return customSessionResolver(request);
  }

  // Authorization Bearer token or session cookies
  const authHeader = request?.headers?.get('authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (request?.cookies) {
    token =
      request.cookies.get('sineva_session')?.value ||
      request.cookies.get('better-auth.session_token')?.value;
  }

  if (!token) {
    return null;
  }

  try {
    if (token.includes('.')) {
      const authService = getJwtAuthService();
      const resolved = await authService.resolveSessionFromToken(token);
      if (resolved) {
        return {
          userId: resolved.userId,
          sessionId: resolved.sessionId,
          role: resolved.memberships[0]?.role,
          freshUntil: resolved.freshUntil,
          staffRole: resolved.staffRole,
          emailVerified: resolved.emailVerified,
          memberships: resolved.memberships,
        };
      }
    }

    const prisma = getPrismaClient();
    const session = await prisma.session.findFirst({
      where: {
        token,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                specialists: true,
              },
            },
            staff_profile: true,
          },
        },
      },
    });

    if (!session || !session.user) {
      return null;
    }

    return {
      userId: session.user_id,
      sessionId: session.id,
      freshUntil: session.fresh_until,
      staffRole: session.user.staff_profile?.staff_role as 'operator' | 'platform_admin' | null,
      memberships: session.user.memberships.map((m: {
        workspace_id: string;
        role: string;
        specialist_scope: string;
        specialists: Array<{ agent_slug: string }>;
      }) => ({
        workspaceId: m.workspace_id,
        role: m.role as UserRole,
        specialistScope: m.specialist_scope === 'selected' ? 'selected' : 'all',
        allowedSpecialists: m.specialists.map((s: { agent_slug: string }) => s.agent_slug),
      })),
    };
  } catch {
    // If DB is offline or lookup fails, treat as unauthenticated
    return null;
  }
}

/**
 * Route guard wrapper enforcing authentication, workspace isolation, permissions, and CSRF.
 */
export function withAuth<TParams = Record<string, string | string[]>>(
  handler: AuthenticatedHandler<TParams>,
  options: RouteAuthOptions,
) {
  return async (
    request?: NextRequest,
    routeProps?: { params?: Promise<TParams> | TParams },
  ): Promise<NextResponse> => {
    try {
      const requestId = extractRequestId(request);
      const resolvedParams = routeProps?.params ? await Promise.resolve(routeProps.params) : undefined;

      // 1. Check for internal service API key bypass if enabled
      const internalKey = request?.headers?.get('x-internal-api-key');
      let expectedKey: string | undefined;
      try {
        expectedKey = getEnvConfig().ai_engine_internal_api_key;
      } catch {
        // env validation may not have run
      }
      const isInternalCaller = Boolean(
        options.allowInternalApiKey && internalKey && expectedKey && internalKey === expectedKey,
      );

      if (isInternalCaller) {
        const internalContext: RequestContext = {
          user_id: 'system:internal',
          session_id: 'internal',
          request_id: requestId,
          staff_role: 'operator',
          actor: { type: 'system', id: 'internal' },
        };
        return await handler(request!, { requestContext: internalContext, params: resolvedParams });
      }

      // 2. Resolve session
      const session = await resolveSession(request);

      // 3. Handle public routes
      if (options.scope === 'public') {
        const publicContext: RequestContext = session
          ? {
              user_id: session.userId,
              session_id: session.sessionId,
              request_id: requestId,
              staff_role: session.staffRole,
              actor: { type: 'user', id: session.userId },
            }
          : {
              user_id: 'anonymous',
              session_id: 'none',
              request_id: requestId,
              actor: { type: 'system', id: 'anonymous' },
            };

        return await handler(request!, { requestContext: publicContext, params: resolvedParams });
      }

      // 4. Require authentication for non-public routes
      if (!session) {
        throw new UnauthorizedError('Authentication required');
      }

      // 4a. Fresh session check (FR-AUTH-06, FR-AUTH-01c)
      if (options.requireFreshSession) {
        if (!session.freshUntil || session.freshUntil.getTime() <= Date.now()) {
          throw new ForbiddenError(
            'A fresh session is required for this action. Please re-authenticate.',
          );
        }
      }

      // 5. CSRF protection on cookie-authenticated state-changing methods
      if (request) {
        const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
        const isCookieAuth = Boolean(
          request.cookies.get('sineva_session') ||
            request.cookies.get('better-auth.session_token'),
        );
        if (isStateChanging && isCookieAuth) {
          verifyCsrf(request);
        }
      }

      // 6. Required role or internal check (e.g. POST /api/v1/agents)
      if (options.requiredRoleOrInternal === 'owner') {
        const isOwner =
          session.role === 'owner' ||
          session.memberships.some((m) => m.role === 'owner' || m.workspaceId === '*');
        const isStaff = session.staffRole === 'operator' || session.staffRole === 'platform_admin';
        if (!isOwner && !isStaff) {
          throw new ForbiddenError('Operation requires owner role or internal service authorization');
        }
      }

      // 7. Staff role requirement
      if (options.requiredStaffRole && session.staffRole !== options.requiredStaffRole) {
        throw new ForbiddenError(`Operation requires staff role: ${options.requiredStaffRole}`);
      }

      // 8. Workspace tenancy scope enforcement
      let targetWorkspaceId: string | undefined;
      let memberRole: UserRole | undefined;
      let specialistScope: 'all' | 'selected' = 'all';
      let allowedSpecialists: string[] | undefined;

      if (options.scope === 'workspace') {
        // Extract workspace_id from URL path: /api/v1/workspaces/{workspace_id}/...
        if (request) {
          const pathSegments = request.nextUrl.pathname.split('/');
          const wsIdx = pathSegments.indexOf('workspaces');
          if (wsIdx !== -1 && pathSegments.length > wsIdx + 1) {
            targetWorkspaceId = pathSegments[wsIdx + 1];
          } else if (resolvedParams && typeof resolvedParams === 'object' && 'workspace_id' in resolvedParams) {
            targetWorkspaceId = String(resolvedParams.workspace_id);
          } else {
            targetWorkspaceId = request.headers.get('x-workspace-id') ?? undefined;
          }

          // Fallback for legacy request payloads before M0-28 migration
          if (!targetWorkspaceId && request.headers.get('content-type')?.includes('application/json')) {
            try {
              const cloned = request.clone();
              const body = await cloned.json();
              if (body && typeof body === 'object' && 'workspace_id' in body && typeof body.workspace_id === 'string') {
                targetWorkspaceId = body.workspace_id;
              }
            } catch {
              // body parse errors will be handled downstream
            }
          }
        }

        if (!targetWorkspaceId) {
          targetWorkspaceId = 'default_workspace';
        }

        // FR-AUTH-03: Email verification is required before taking any workspace action
        if (session.emailVerified === false) {
          return sendErrorJson(
            {
              message: 'Email verification is required before taking workspace actions.',
              code: 'email_not_verified',
              status: 403,
              request_id: requestId,
            },
            { status: 403 },
          );
        }

        // FR-AUTH-24: If user is NOT a member of targetWorkspaceId, return 404 (never 403)
        const membership = session.memberships.find(
          (m) => m.workspaceId === targetWorkspaceId || m.workspaceId === '*',
        );

        if (!membership) {
          throw new NotFoundError('Workspace', targetWorkspaceId);
        }

        memberRole = membership.role;
        specialistScope = membership.specialistScope;
        allowedSpecialists = membership.allowedSpecialists;

        // 9. Check permission if specified
        if (options.permission) {
          // If specialist.use, check per-specialist scoping (FR-AUTH-19)
          const specialistSlug =
            options.specialistSlugExtractor && request
              ? options.specialistSlugExtractor(
                  request,
                  resolvedParams as Record<string, string | string[]>,
                )
              : undefined;

          if (
            options.permission === 'specialist.use' &&
            specialistScope === 'selected'
          ) {
            if (
              !specialistSlug ||
              !allowedSpecialists ||
              !allowedSpecialists.includes(specialistSlug)
            ) {
              throw new ForbiddenError(
                `Access to specialist '${specialistSlug ?? 'unspecified'}' is restricted for this member`,
              );
            }
          }

          const decision = hasPermission(memberRole, options.permission, {
            actorUserId: session.userId,
            actorRole: memberRole,
            specialistSlug,
            allowedSpecialists,
          });

          if (!decision.allowed) {
            throw new ForbiddenError(decision.reason ?? `Permission denied: ${options.permission}`);
          }
        }
      } else if (options.scope === 'user') {
        // User-scoped routes (e.g. /api/v1/me)
        if (options.permission) {
          const effectiveRole = session.role ?? 'member';
          const decision = hasPermission(effectiveRole, options.permission, {
            actorUserId: session.userId,
            actorRole: effectiveRole,
          });
          if (!decision.allowed) {
            throw new ForbiddenError(decision.reason ?? `Permission denied: ${options.permission}`);
          }
        }
      }

      // 10. Construct RequestContext and call handler
      const requestContext: RequestContext = {
        user_id: session.userId,
        workspace_id: targetWorkspaceId,
        role: memberRole ?? session.role,
        specialist_scope: specialistScope,
        allowed_specialists: allowedSpecialists,
        session_id: session.sessionId,
        request_id: requestId,
        staff_role: session.staffRole,
        fresh_until: session.freshUntil,
        email_verified: session.emailVerified,
        ip: clientIp(request),
        user_agent: request?.headers?.get('user-agent') ?? undefined,
        actor: {
          type: 'user',
          id: session.userId,
        },
      };

      return await handler(request!, { requestContext, params: resolvedParams });
    } catch (error) {
      return handleRouteError(error, request);
    }
  };
}
