import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  C2_PERMISSION_MATRIX_FIXTURE,
  CANONICAL_PERMISSION_KEYS,
  hasPermission,
} from '@/server/domain/permissions/registry';
import { withAuth } from '@/server/http/with_auth';
import { sanitizeNextRedirect } from '@/proxy';
import { sendSuccessJson } from '@/server/http/response_helper';

const API_ROOT = resolve(import.meta.dirname, '../app/api');

function getRouteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getRouteFiles(fullPath));
    } else if (entry === 'route.ts') {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Permission Registry & RBAC Matrix (WP-M0-22)', () => {
  it('defines all canonical permission keys from Section C2', () => {
    expect(CANONICAL_PERMISSION_KEYS.length).toBeGreaterThan(0);
    const matrixKeys = Object.keys(C2_PERMISSION_MATRIX_FIXTURE);

    for (const key of matrixKeys) {
      expect(
        CANONICAL_PERMISSION_KEYS,
        `Permission key ${key} must be in CANONICAL_PERMISSION_KEYS`,
      ).toContain(key);
    }
  });

  it('correctly evaluates permissions for owner role (full authority)', () => {
    for (const key of CANONICAL_PERMISSION_KEYS) {
      const decision = hasPermission('owner', key);
      expect(
        decision.allowed,
        `Owner must have permission for ${key}`,
      ).toBe(true);
    }
  });

  it('correctly restricts viewer role to read-only permissions', () => {
    // Read permissions allowed for viewer
    expect(hasPermission('viewer', 'workspace.view').allowed).toBe(true);
    expect(hasPermission('viewer', 'chat.read').allowed).toBe(true);
    expect(hasPermission('viewer', 'storage.read').allowed).toBe(true);
    expect(hasPermission('viewer', 'profile.view').allowed).toBe(true);

    // Mutation permissions forbidden for viewer
    expect(hasPermission('viewer', 'chat.create').allowed).toBe(false);
    expect(hasPermission('viewer', 'storage.upload').allowed).toBe(false);
    expect(hasPermission('viewer', 'specialist.use').allowed).toBe(false);
    expect(hasPermission('viewer', 'member.invite').allowed).toBe(false);
    expect(hasPermission('viewer', 'workspace.update').allowed).toBe(false);
  });

  it('enforces policy constraints for limited permissions (e.g. member.invite, member.update_role)', () => {
    const inviteDecision = hasPermission('member', 'member.invite');
    expect(inviteDecision.allowed).toBe(false);

    const adminInviteDecision = hasPermission('admin', 'member.invite');
    expect(adminInviteDecision.allowed).toBe(true);
    expect(adminInviteDecision.isLimited).toBe(true);
  });
});

describe('Route Inventory Guard Verification (WP-M0-22)', () => {
  const routeFiles = getRouteFiles(API_ROOT);

  it('finds existing API route files', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it('verifies that every API route handler uses withAuth or is explicitly allowlisted as public', () => {
    const PUBLIC_ALLOWLIST = [
      'app/api/openapi.json/route.ts',
      'app/api/v1/health/route.ts',
    ];

    const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    for (const filePath of routeFiles) {
      const relPath = relative(resolve(import.meta.dirname, '..'), filePath);
      const isPublic = PUBLIC_ALLOWLIST.some((allowed) => relPath.endsWith(allowed));

      if (isPublic) {
        continue;
      }

      const content = readFileSync(filePath, 'utf-8');

      // Check each exported HTTP method
      for (const method of HTTP_METHODS) {
        const methodRegex = new RegExp(`export\\s+(?:const|async\\s+function)\\s+${method}\\b`);
        if (methodRegex.test(content)) {
          expect(
            content.includes('withAuth') || content.includes('guardRoute'),
            `Route ${relPath} (${method}) must be wrapped with withAuth guard`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('withAuth Guard Runtime Enforcement (WP-M0-22)', () => {
  const sampleHandler = withAuth(
    async (_req, { requestContext }) => {
      return sendSuccessJson({
        data: { user_id: requestContext.user_id, workspace_id: requestContext.workspace_id },
        message: 'Success',
        status: 200,
        request_id: requestContext.request_id,
      });
    },
    {
      scope: 'workspace',
      permission: 'chat.create',
    },
  );

  it('returns 401 Unauthorized when unauthenticated', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/workspaces/wks_alpha/chat', {
      method: 'POST',
      headers: {
        'x-test-unauthenticated': 'true',
      },
    });

    const res = await sampleHandler(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('unauthenticated');
  });

  it('returns 404 Not Found (never 403) when user does not belong to the target workspace (FR-AUTH-24)', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/workspaces/wks_other_tenant/chat', {
      method: 'POST',
      headers: {
        'x-test-session-user-id': 'usr_bob',
        'x-test-session-role': 'member',
        'x-test-session-workspaces': 'wks_bob_workspace',
      },
    });

    const res = await sampleHandler(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('not_found');
    expect(body.message).toContain("Workspace 'wks_other_tenant' was not found");
  });

  it('returns 403 Forbidden when user role lacks the required permission', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/workspaces/wks_alpha/chat', {
      method: 'POST',
      headers: {
        'x-test-session-user-id': 'usr_viewer',
        'x-test-session-role': 'viewer',
        'x-test-session-workspaces': 'wks_alpha',
      },
    });

    const res = await sampleHandler(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('forbidden');
  });

  it('returns 200 and passes RequestContext when authenticated with valid workspace membership and role', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/workspaces/wks_alpha/chat', {
      method: 'POST',
      headers: {
        'x-test-session-user-id': 'usr_member_01',
        'x-test-session-role': 'member',
        'x-test-session-workspaces': 'wks_alpha',
      },
    });

    const res = await sampleHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.workspace_id).toBe('wks_alpha');
    expect(body.data.user_id).toBe('usr_member_01');
  });

  it('enforces specialist_scope restriction for specialist.use', async () => {
    const specialistHandler = withAuth(
      async (_req, { requestContext }) => {
        return sendSuccessJson({
          data: { status: 'ok', user: requestContext.user_id },
          message: 'OK',
          status: 200,
          request_id: requestContext.request_id,
        });
      },
      {
        scope: 'workspace',
        permission: 'specialist.use',
        specialistSlugExtractor: () => 'sinofinance',
      },
    );

    // Member with restricted scope not including sinofinance
    const restrictedReq = new NextRequest('http://localhost:3000/api/v1/workspaces/wks_beta/chat', {
      method: 'POST',
      headers: {
        'x-test-session-user-id': 'usr_restricted',
        'x-test-session-role': 'member',
        'x-test-session-workspaces': 'wks_beta',
        'x-test-specialist-scope': 'selected',
        'x-test-session-specialists': 'sinopeople,sinosales',
      },
    });

    const deniedRes = await specialistHandler(restrictedReq);
    expect(deniedRes.status).toBe(403);
    const deniedBody = await deniedRes.json();
    expect(deniedBody.success).toBe(false);

    // Member with restricted scope that DOES include sinofinance
    const allowedReq = new NextRequest('http://localhost:3000/api/v1/workspaces/wks_beta/chat', {
      method: 'POST',
      headers: {
        'x-test-session-user-id': 'usr_allowed',
        'x-test-session-role': 'member',
        'x-test-session-workspaces': 'wks_beta',
        'x-test-specialist-scope': 'selected',
        'x-test-session-specialists': 'sinopeople,sinofinance',
      },
    });

    const allowedRes = await specialistHandler(allowedReq);
    expect(allowedRes.status).toBe(200);
  });
});

describe('proxy.ts Page Guard & Open Redirect Defense (WP-M0-22)', () => {
  it('allows safe relative redirect paths', () => {
    expect(sanitizeNextRedirect('/w/sineva-hq/chat')).toBe('/w/sineva-hq/chat');
    expect(sanitizeNextRedirect('/account/profile')).toBe('/account/profile');
    expect(sanitizeNextRedirect('/w/slug?tab=settings')).toBe('/w/slug?tab=settings');
  });

  it('rejects external or protocol-relative redirect URLs to prevent open-redirect phishing', () => {
    expect(sanitizeNextRedirect('https://evil.com')).toBe('/');
    expect(sanitizeNextRedirect('http://attacker.com/steal')).toBe('/');
    expect(sanitizeNextRedirect('//malicious.com')).toBe('/');
    expect(sanitizeNextRedirect('javascript:alert(1)')).toBe('/');
    expect(sanitizeNextRedirect('')).toBe('/');
    expect(sanitizeNextRedirect(null)).toBe('/');
    expect(sanitizeNextRedirect(undefined)).toBe('/');
  });
});
