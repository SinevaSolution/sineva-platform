import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getWorkspaces, POST as postWorkspace } from '@/app/api/v1/workspaces/route';
import { GET as getWorkspaceDetail, PATCH as patchWorkspaceDetail } from '@/app/api/v1/workspaces/[workspace_id]/route';

const mockCreateWorkspace = vi.fn();
const mockGetWorkspace = vi.fn();
const mockUpdateWorkspace = vi.fn();
const mockListUserWorkspaces = vi.fn();

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getCreateWorkspaceUseCase: () => ({ execute: mockCreateWorkspace }),
    getGetWorkspaceUseCase: () => ({ execute: mockGetWorkspace }),
    getUpdateWorkspaceUseCase: () => ({ execute: mockUpdateWorkspace }),
    getListUserWorkspacesUseCase: () => ({ execute: mockListUserWorkspaces }),
  };
});

describe('Workspace API Routes (WP-M0-26, FR-AUTH-10, 11, 12, 24, 29, 30)', () => {
  const workspaceIdA = '11111111-1111-4111-8111-111111111111';
  const workspaceIdB = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/workspaces', () => {
    it('returns 200 with list of user workspaces', async () => {
      mockListUserWorkspaces.mockResolvedValue([
        {
          workspace: { id: workspaceIdA, workspace_name: 'HQ', workspace_slug: 'hq' },
          role: 'owner',
        },
      ]);

      const req = new NextRequest('https://app.sineva.ai/api/v1/workspaces', {
        headers: {
          'x-test-session-user-id': 'usr-1',
          'x-test-session-role': 'owner',
          'x-test-session-workspaces': workspaceIdA,
        },
      });

      const res = await getWorkspaces(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].workspace.workspace_name).toBe('HQ');
    });
  });

  describe('POST /api/v1/workspaces', () => {
    it('returns 201 and creates workspace for authenticated user', async () => {
      mockCreateWorkspace.mockResolvedValue({
        id: workspaceIdA,
        workspace_name: 'New Ventures',
        workspace_slug: 'new-ventures',
      });

      const req = new NextRequest('https://app.sineva.ai/api/v1/workspaces', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-session-user-id': 'usr-1',
          'x-sineva-action': '1',
        },
        body: JSON.stringify({
          workspace_name: 'New Ventures',
        }),
      });

      const res = await postWorkspace(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.workspace_name).toBe('New Ventures');
      expect(mockCreateWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_name: 'New Ventures',
          owner_user_id: 'usr-1',
        }),
      );
    });
  });

  describe('GET /api/v1/workspaces/[workspace_id]', () => {
    it('returns 200 when user has valid membership in workspace', async () => {
      mockGetWorkspace.mockResolvedValue({
        id: workspaceIdA,
        workspace_name: 'Acme Corp',
        workspace_slug: 'acme-corp',
      });

      const req = new NextRequest(`https://app.sineva.ai/api/v1/workspaces/${workspaceIdA}`, {
        headers: {
          'x-test-session-user-id': 'usr-1',
          'x-test-session-role': 'member',
          'x-test-session-workspaces': workspaceIdA,
        },
      });

      const res = await getWorkspaceDetail(req, {
        params: Promise.resolve({ workspace_id: workspaceIdA }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.workspace_name).toBe('Acme Corp');
    });

    it('returns 404 Not Found (never 403) when user is not a member of target workspace (FR-AUTH-24)', async () => {
      const req = new NextRequest(`https://app.sineva.ai/api/v1/workspaces/${workspaceIdB}`, {
        headers: {
          'x-test-session-user-id': 'usr-1',
          'x-test-session-role': 'member',
          // User only belongs to workspace A, attempting to access workspace B
          'x-test-session-workspaces': workspaceIdA,
        },
      });

      const res = await getWorkspaceDetail(req, {
        params: Promise.resolve({ workspace_id: workspaceIdB }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.code).toBe('not_found');
      expect(mockGetWorkspace).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/v1/workspaces/[workspace_id]', () => {
    it('returns 200 and updates workspace when caller has workspace.update permission (owner/admin)', async () => {
      mockUpdateWorkspace.mockResolvedValue({
        id: workspaceIdA,
        workspace_name: 'Acme International',
        workspace_slug: 'acme-corp',
      });

      const req = new NextRequest(`https://app.sineva.ai/api/v1/workspaces/${workspaceIdA}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-test-session-user-id': 'usr-1',
          'x-test-session-role': 'admin',
          'x-test-session-workspaces': workspaceIdA,
          'x-sineva-action': '1',
        },
        body: JSON.stringify({
          workspace_name: 'Acme International',
        }),
      });

      const res = await patchWorkspaceDetail(req, {
        params: Promise.resolve({ workspace_id: workspaceIdA }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.workspace_name).toBe('Acme International');
    });

    it('returns 403 Forbidden when caller role lacks workspace.update (e.g. viewer)', async () => {
      const req = new NextRequest(`https://app.sineva.ai/api/v1/workspaces/${workspaceIdA}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-test-session-user-id': 'usr-viewer',
          'x-test-session-role': 'viewer',
          'x-test-session-workspaces': workspaceIdA,
          'x-sineva-action': '1',
        },
        body: JSON.stringify({
          workspace_name: 'Hacked Name',
        }),
      });

      const res = await patchWorkspaceDetail(req, {
        params: Promise.resolve({ workspace_id: workspaceIdA }),
      });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.code).toBe('forbidden');
      expect(mockUpdateWorkspace).not.toHaveBeenCalled();
    });
  });
});
