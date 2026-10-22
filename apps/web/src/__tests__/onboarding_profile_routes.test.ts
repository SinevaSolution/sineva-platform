import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitedError, UpstreamServiceError, UpstreamUnavailableError, FirstWorkspaceNotAllowedError } from '@/server/domain/errors/domain_error';
import type { UserRole } from '@/server/domain/entities/user';
import { POST as postFirstWorkspace } from '@/app/api/v1/me/first-workspace/route';
import { GET as getOnboarding, PATCH as patchOnboarding } from '@/app/api/v1/workspaces/[workspace_id]/onboarding/route';
import { POST as postComplete } from '@/app/api/v1/workspaces/[workspace_id]/onboarding/complete/route';
import { GET as getFirstTasks } from '@/app/api/v1/workspaces/[workspace_id]/onboarding/first-tasks/route';
import { POST as postDismiss } from '@/app/api/v1/workspaces/[workspace_id]/onboarding/first-tasks/[task_id]/dismiss/route';
import { GET as getProfile, PUT as putProfile } from '@/app/api/v1/workspaces/[workspace_id]/profile/route';
import { GET as getPack } from '@/app/api/v1/workspaces/[workspace_id]/profile/pack/route';
import { GET as getVersions } from '@/app/api/v1/workspaces/[workspace_id]/profile/versions/route';
import { GET as getVersion } from '@/app/api/v1/workspaces/[workspace_id]/profile/versions/[version]/route';
import { POST as postRestore } from '@/app/api/v1/workspaces/[workspace_id]/profile/versions/[version]/restore/route';
import { GET as getOfferings, POST as postOffering } from '@/app/api/v1/workspaces/[workspace_id]/profile/offerings/route';
import { PATCH as patchOffering, DELETE as deleteOffering } from '@/app/api/v1/workspaces/[workspace_id]/profile/offerings/[offering_id]/route';
import { GET as getPolicies, POST as postPolicy } from '@/app/api/v1/workspaces/[workspace_id]/profile/policies/route';
import { PATCH as patchPolicy, DELETE as deletePolicy } from '@/app/api/v1/workspaces/[workspace_id]/profile/policies/[policy_id]/route';
import { POST as postScan } from '@/app/api/v1/workspaces/[workspace_id]/profile/scans/route';
import { GET as getScan, DELETE as deleteScan } from '@/app/api/v1/workspaces/[workspace_id]/profile/scans/[scan_id]/route';

const uc = vi.hoisted(() => {
  const names = [
    'createFirstWorkspace', 'getOnboarding', 'updateOnboarding', 'completeOnboarding', 'getFirstTasks', 'dismissFirstTask',
    'getProfile', 'saveProfile', 'getPack', 'listVersions', 'getVersion', 'restoreVersion',
    'createOffering', 'updateOffering', 'deleteOffering', 'createPolicy', 'updatePolicy', 'deletePolicy',
    'requestScan', 'getScan', 'deleteScan',
  ] as const;
  return Object.fromEntries(names.map((n) => [n, vi.fn()])) as Record<(typeof names)[number], ReturnType<typeof vi.fn>>;
});

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  const wrap = (fn: ReturnType<typeof vi.fn>) => () => ({ execute: fn });
  return {
    ...actual,
    getCreateFirstWorkspaceUseCase: wrap(uc.createFirstWorkspace),
    getGetOnboardingUseCase: wrap(uc.getOnboarding),
    getUpdateOnboardingUseCase: wrap(uc.updateOnboarding),
    getCompleteOnboardingUseCase: wrap(uc.completeOnboarding),
    getGetFirstTasksUseCase: wrap(uc.getFirstTasks),
    getDismissFirstTaskUseCase: wrap(uc.dismissFirstTask),
    getGetBusinessProfileUseCase: wrap(uc.getProfile),
    getSaveBusinessProfileUseCase: wrap(uc.saveProfile),
    getGetProfilePackUseCase: wrap(uc.getPack),
    getListProfileVersionsUseCase: wrap(uc.listVersions),
    getGetProfileVersionUseCase: wrap(uc.getVersion),
    getRestoreProfileVersionUseCase: wrap(uc.restoreVersion),
    getCreateOfferingUseCase: wrap(uc.createOffering),
    getUpdateOfferingUseCase: wrap(uc.updateOffering),
    getDeleteOfferingUseCase: wrap(uc.deleteOffering),
    getCreatePolicyUseCase: wrap(uc.createPolicy),
    getUpdatePolicyUseCase: wrap(uc.updatePolicy),
    getDeletePolicyUseCase: wrap(uc.deletePolicy),
    getRequestProfileScanUseCase: wrap(uc.requestScan),
    getGetProfileScanUseCase: wrap(uc.getScan),
    getDeleteProfileScanUseCase: wrap(uc.deleteScan),
  };
});

installHeaderSessionResolver();

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const SCAN_ID = '5b0f9a3e-2c4d-4e1a-8f6b-7d3c1a9e0b42';
const OFFER_ID = '6c1a0b4f-3d5e-4f2b-9a7c-8e4d2b0f1c53';
const POLICY_ID = '7d2b1c5a-4e6f-4a3c-8b8d-9f5e3c1a2d64';

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

interface Row {
  name: string;
  handler: Handler;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: (ws: string) => string;
  params: (ws: string) => Record<string, string>;
  mock: ReturnType<typeof vi.fn>;
  result: unknown;
  status: number;
  /** Roles the route must refuse with 403 (a member of the workspace). */
  denied: UserRole[];
  body?: unknown;
  invalidBodies?: unknown[];
  invalidPaths?: Array<{ path: string; params: Record<string, string> }>;
  args: (ws: string) => Record<string, unknown>;
  data: (data: Record<string, unknown>) => void;
}

const profileResult = { profile: { id: null, workspace_id: WS_A, version: 0 }, offerings: [], policies: [] };
const base = (ws: string) => `https://app.sineva.id/api/v1/workspaces/${ws}`;

const ROWS: Row[] = [
  {
    name: 'GET onboarding',
    handler: getOnboarding as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/onboarding`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.getOnboarding, result: { state: { current_step: 1 }, checklist: [] }, status: 200, denied: [],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1' }),
    data: (d) => expect(d).toHaveProperty('onboarding'),
  },
  {
    name: 'PATCH onboarding',
    handler: patchOnboarding as Handler, method: 'PATCH',
    path: (ws) => `${base(ws)}/onboarding`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.updateOnboarding, result: { state: { current_step: 2 }, workspace: { id: WS_A } }, status: 200, denied: [],
    body: { step: 2, action: 'save', answers: { business_name: 'Toko', business_type: 'online_shop' } },
    invalidBodies: [{ step: 9, action: 'save' }, { step: 1, action: 'delete' }, { step: 1, action: 'save', user_id: 'x' }, {}],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1', step: 2, action: 'save' }),
    data: (d) => expect(d).toHaveProperty('onboarding'),
  },
  {
    name: 'POST onboarding/complete',
    handler: postComplete as Handler, method: 'POST',
    path: (ws) => `${base(ws)}/onboarding/complete`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.completeOnboarding, result: { ...profileResult, state: { status: 'completed' }, version: 1, warnings: [] }, status: 200,
    denied: ['admin', 'member', 'viewer'],
    body: { profile: { display_name: 'Toko Kopi' } },
    invalidBodies: [{ profile: { display_name: 123 } }, { profile: { user_id: 'x' } }, { surprise: true }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1' }),
    data: (d) => expect(d).toHaveProperty('onboarding'),
  },
  {
    name: 'GET onboarding/first-tasks',
    handler: getFirstTasks as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/onboarding/first-tasks?locale=en`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.getFirstTasks, result: [{ task_id: 'a' }, { task_id: 'b' }, { task_id: 'c' }], status: 200, denied: [],
    invalidPaths: [{ path: 'onboarding/first-tasks?locale=fr', params: {} }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1', locale: 'en' }),
    data: (d) => expect(d.tasks).toHaveLength(3),
  },
  {
    name: 'POST onboarding/first-tasks/{task_id}/dismiss',
    handler: postDismiss as Handler, method: 'POST',
    path: (ws) => `${base(ws)}/onboarding/first-tasks/generic_social_week/dismiss`,
    params: (ws) => ({ workspace_id: ws, task_id: 'generic_social_week' }),
    mock: uc.dismissFirstTask, result: [{ task_id: 'generic_social_week', dismissed_at: 'x' }], status: 200, denied: [],
    invalidPaths: [{ path: 'onboarding/first-tasks/Bad%20Id!/dismiss', params: { task_id: 'Bad Id!' } }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1', task_id: 'generic_social_week' }),
    data: (d) => expect(d.dismissed_tasks).toHaveLength(1),
  },
  {
    name: 'GET profile',
    handler: getProfile as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/profile`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.getProfile, result: profileResult, status: 200, denied: [],
    args: (ws) => ({ workspace_id: ws }),
    data: (d) => expect(d).toHaveProperty('profile'),
  },
  {
    name: 'PUT profile',
    handler: putProfile as Handler, method: 'PUT',
    path: (ws) => `${base(ws)}/profile`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.saveProfile, result: { ...profileResult, version: 1, changed: true, warnings: [] }, status: 200,
    denied: ['member', 'viewer'],
    body: { display_name: 'Toko Kopi', city: 'Bandung' },
    invalidBodies: [{ display_name: '' }, { user_id: 'attacker' }, { workspace_id: WS_B }, { goals: ['a', 'b', 'c', 'd'] }, { website_url: 'javascript:alert(1)' }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1' }),
    data: (d) => expect(d).toMatchObject({ version: 1, changed: true }),
  },
  {
    name: 'GET profile/pack',
    handler: getPack as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/profile/pack`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.getPack, result: { profile_version: 1, identity: {} }, status: 200, denied: [],
    args: (ws) => ({ workspace_id: ws }),
    data: (d) => expect(d.pack).toMatchObject({ profile_version: 1 }),
  },
  {
    name: 'GET profile/versions',
    handler: getVersions as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/profile/versions?limit=10`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.listVersions, result: [{ version: 2 }, { version: 1 }], status: 200, denied: ['member', 'viewer'],
    invalidPaths: [{ path: 'profile/versions?limit=0', params: {} }, { path: 'profile/versions?limit=1000', params: {} }],
    args: (ws) => ({ workspace_id: ws, limit: 10 }),
    data: (d) => expect(d.versions).toHaveLength(2),
  },
  {
    name: 'GET profile/versions/{version}',
    handler: getVersion as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/profile/versions/2`, params: (ws) => ({ workspace_id: ws, version: '2' }),
    mock: uc.getVersion, result: { version: { version: 2 }, diff: [] }, status: 200, denied: ['member', 'viewer'],
    invalidPaths: [{ path: 'profile/versions/abc', params: { version: 'abc' } }, { path: 'profile/versions/0', params: { version: '0' } }],
    args: (ws) => ({ workspace_id: ws, version: 2 }),
    data: (d) => expect(d).toHaveProperty('diff'),
  },
  {
    name: 'POST profile/versions/{version}/restore',
    handler: postRestore as Handler, method: 'POST',
    path: (ws) => `${base(ws)}/profile/versions/2/restore`, params: (ws) => ({ workspace_id: ws, version: '2' }),
    mock: uc.restoreVersion, result: { ...profileResult, version: 4 }, status: 200, denied: ['member', 'viewer'],
    invalidPaths: [{ path: 'profile/versions/abc/restore', params: { version: 'abc' } }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1', version: 2 }),
    data: (d) => expect(d.version).toBe(4),
  },
  {
    name: 'GET profile/offerings',
    handler: getOfferings as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/profile/offerings`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.getProfile, result: { ...profileResult, offerings: [{ id: OFFER_ID }] }, status: 200, denied: [],
    args: (ws) => ({ workspace_id: ws }),
    data: (d) => expect(d.offerings).toHaveLength(1),
  },
  {
    name: 'POST profile/offerings',
    handler: postOffering as Handler, method: 'POST',
    path: (ws) => `${base(ws)}/profile/offerings`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.createOffering, result: { offering: { id: OFFER_ID }, version: 2 }, status: 201, denied: ['member', 'viewer'],
    body: { name: 'Kopi Gayo', price_amount: 85000 },
    invalidBodies: [{}, { name: 'X', price_amount: -1 }, { name: 'X', price_amount: 1.5 }, { name: 'X', workspace_id: WS_B }, { name: 'X', url: 'ftp://x' }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1' }),
    data: (d) => expect(d).toHaveProperty('offering'),
  },
  {
    name: 'PATCH profile/offerings/{offering_id}',
    handler: patchOffering as Handler, method: 'PATCH',
    path: (ws) => `${base(ws)}/profile/offerings/${OFFER_ID}`, params: (ws) => ({ workspace_id: ws, offering_id: OFFER_ID }),
    mock: uc.updateOffering, result: { offering: { id: OFFER_ID }, version: 3 }, status: 200, denied: ['member', 'viewer'],
    body: { name: 'Kopi Gayo 500g' },
    invalidBodies: [{}, { price_amount: 'free' }],
    invalidPaths: [{ path: 'profile/offerings/not-a-uuid', params: { offering_id: 'not-a-uuid' } }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1', offering_id: OFFER_ID }),
    data: (d) => expect(d).toHaveProperty('offering'),
  },
  {
    name: 'DELETE profile/offerings/{offering_id}',
    handler: deleteOffering as Handler, method: 'DELETE',
    path: (ws) => `${base(ws)}/profile/offerings/${OFFER_ID}`, params: (ws) => ({ workspace_id: ws, offering_id: OFFER_ID }),
    mock: uc.deleteOffering, result: { version: 4 }, status: 200, denied: ['member', 'viewer'],
    invalidPaths: [{ path: 'profile/offerings/not-a-uuid', params: { offering_id: 'not-a-uuid' } }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1', offering_id: OFFER_ID }),
    data: (d) => expect(d.version).toBe(4),
  },
  {
    name: 'GET profile/policies',
    handler: getPolicies as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/profile/policies`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.getProfile, result: { ...profileResult, policies: [{ id: POLICY_ID }] }, status: 200, denied: [],
    args: (ws) => ({ workspace_id: ws }),
    data: (d) => expect(d.policies).toHaveLength(1),
  },
  {
    name: 'POST profile/policies',
    handler: postPolicy as Handler, method: 'POST',
    path: (ws) => `${base(ws)}/profile/policies`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.createPolicy, result: { policy: { id: POLICY_ID }, version: 2, warnings: [] }, status: 201, denied: ['member', 'viewer'],
    body: { kind: 'returns', title: 'Returns', body: 'Within 7 days.' },
    invalidBodies: [{ kind: 'nope', title: 'x', body: 'y' }, { kind: 'returns', title: '', body: 'y' }, { kind: 'returns', title: 'x' }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1' }),
    data: (d) => expect(d).toHaveProperty('policy'),
  },
  {
    name: 'PATCH profile/policies/{policy_id}',
    handler: patchPolicy as Handler, method: 'PATCH',
    path: (ws) => `${base(ws)}/profile/policies/${POLICY_ID}`, params: (ws) => ({ workspace_id: ws, policy_id: POLICY_ID }),
    mock: uc.updatePolicy, result: { policy: { id: POLICY_ID }, version: 3, warnings: [] }, status: 200, denied: ['member', 'viewer'],
    body: { body: 'Within 14 days.' },
    invalidBodies: [{}, { kind: 'nope' }],
    invalidPaths: [{ path: 'profile/policies/not-a-uuid', params: { policy_id: 'not-a-uuid' } }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1', policy_id: POLICY_ID }),
    data: (d) => expect(d).toHaveProperty('policy'),
  },
  {
    name: 'DELETE profile/policies/{policy_id}',
    handler: deletePolicy as Handler, method: 'DELETE',
    path: (ws) => `${base(ws)}/profile/policies/${POLICY_ID}`, params: (ws) => ({ workspace_id: ws, policy_id: POLICY_ID }),
    mock: uc.deletePolicy, result: { version: 5 }, status: 200, denied: ['member', 'viewer'],
    invalidPaths: [{ path: 'profile/policies/not-a-uuid', params: { policy_id: 'not-a-uuid' } }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1', policy_id: POLICY_ID }),
    data: (d) => expect(d.version).toBe(5),
  },
  {
    name: 'POST profile/scans',
    handler: postScan as Handler, method: 'POST',
    path: (ws) => `${base(ws)}/profile/scans`, params: (ws) => ({ workspace_id: ws }),
    mock: uc.requestScan, result: { id: SCAN_ID, status: 'succeeded' }, status: 201, denied: ['member', 'viewer'],
    body: { source_url: 'https://tokokopi.example/', locale: 'id' },
    invalidBodies: [{}, { source_url: '' }, { source_url: 'https://x.example/', locale: 'fr' }, { source_url: 'https://x.example/', workspace_id: WS_B }],
    args: (ws) => ({ workspace_id: ws, user_id: 'usr-1' }),
    data: (d) => expect(d.scan).toMatchObject({ id: SCAN_ID }),
  },
  {
    name: 'GET profile/scans/{scan_id}',
    handler: getScan as Handler, method: 'GET',
    path: (ws) => `${base(ws)}/profile/scans/${SCAN_ID}`, params: (ws) => ({ workspace_id: ws, scan_id: SCAN_ID }),
    mock: uc.getScan, result: { id: SCAN_ID, status: 'succeeded' }, status: 200, denied: ['member', 'viewer'],
    invalidPaths: [{ path: 'profile/scans/not-a-uuid', params: { scan_id: 'not-a-uuid' } }],
    args: (ws) => ({ workspace_id: ws, scan_id: SCAN_ID }),
    data: (d) => expect(d.scan).toMatchObject({ id: SCAN_ID }),
  },
  {
    name: 'DELETE profile/scans/{scan_id}',
    handler: deleteScan as Handler, method: 'DELETE',
    path: (ws) => `${base(ws)}/profile/scans/${SCAN_ID}`, params: (ws) => ({ workspace_id: ws, scan_id: SCAN_ID }),
    mock: uc.deleteScan, result: undefined, status: 200, denied: ['member', 'viewer'],
    invalidPaths: [{ path: 'profile/scans/not-a-uuid', params: { scan_id: 'not-a-uuid' } }],
    args: (ws) => ({ workspace_id: ws, scan_id: SCAN_ID }),
    data: (d) => expect(d.scan_id).toBe(SCAN_ID),
  },
];

function call(
  row: Pick<Row, 'handler' | 'method'>,
  url: string,
  params: Record<string, string>,
  options: { role?: UserRole; workspaces?: string[]; body?: unknown; unauthenticated?: boolean; user?: string } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-sineva-action': '1' };
  if (options.unauthenticated) headers['x-test-unauthenticated'] = 'true';
  else {
    headers['x-test-session-user-id'] = options.user ?? 'usr-1';
    headers['x-test-session-role'] = options.role ?? 'owner';
    headers['x-test-session-workspaces'] = (options.workspaces ?? [WS_A]).join(',');
  }
  const init: { method: string; headers: Record<string, string>; body?: string } = { method: row.method, headers };
  if (options.body !== undefined) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  return row.handler(new NextRequest(url, init), { params: Promise.resolve(params) });
}

describe('onboarding and business profile routes (WP-M1-35, WP-M1-36)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each(ROWS)('$name', (row) => {
    const mockResolved = () => row.mock.mockResolvedValue(row.result);

    it('401 without a session', async () => {
      mockResolved();
      const res = await call(row, row.path(WS_A), row.params(WS_A), { unauthenticated: true, body: row.body });
      expect(res.status).toBe(401);
      expect(row.mock).not.toHaveBeenCalled();
    });

    it('404, never 403, for a workspace the caller does not belong to (cross-workspace)', async () => {
      mockResolved();
      const res = await call(row, row.path(WS_A), row.params(WS_A), { workspaces: [WS_B], body: row.body });
      expect(res.status).toBe(404);
      expect(row.mock).not.toHaveBeenCalled();
    });

    it.each(row.denied)('403 for the role %s', async (role) => {
      mockResolved();
      const res = await call(row, row.path(WS_A), row.params(WS_A), { role, body: row.body });
      expect(res.status).toBe(403);
      expect(row.mock).not.toHaveBeenCalled();
    });

    it(`${row.status} with the standard envelope, identity from the session and workspace from the URL`, async () => {
      mockResolved();
      const res = await call(row, row.path(WS_A), row.params(WS_A), { body: row.body });
      const json = await res.json();
      expect(res.status).toBe(row.status);
      expect(json.success).toBe(true);
      expect(json.request_id).toBeTruthy();
      expect(row.mock).toHaveBeenCalledWith(expect.objectContaining(row.args(WS_A)));
      row.data(json.data);
    });

    if (row.body !== undefined) {
      it('ignores any identity smuggled into an accepted body: user and workspace come from the session and the URL', async () => {
        mockResolved();
        const res = await call(row, row.path(WS_A), row.params(WS_A), { body: row.body, user: 'usr-session' });
        expect(res.status).toBe(row.status);
        const received = row.mock.mock.calls[0][0] as Record<string, unknown>;
        expect(received.user_id === undefined || received.user_id === 'usr-session').toBe(true);
        expect(received.workspace_id === undefined || received.workspace_id === WS_A).toBe(true);
      });
    }

    for (const [index, invalid] of (row.invalidBodies ?? []).entries()) {
      it(`422 for an invalid body (${index + 1})`, async () => {
        mockResolved();
        const res = await call(row, row.path(WS_A), row.params(WS_A), { body: invalid });
        const json = await res.json();
        expect(res.status).toBe(422);
        expect(json.success).toBe(false);
        expect(json.code).toBe('validation_failed');
        expect(row.mock).not.toHaveBeenCalled();
      });
    }

    if (row.method !== 'GET' && row.method !== 'DELETE' && row.body !== undefined) {
      it('422 for an empty or malformed JSON body', async () => {
        mockResolved();
        const res = await call(row, row.path(WS_A), row.params(WS_A), { body: '{not json' });
        expect(res.status).toBe(422);
        expect(row.mock).not.toHaveBeenCalled();
      });
    }

    for (const [index, invalid] of (row.invalidPaths ?? []).entries()) {
      it(`422 for an invalid path or query (${index + 1})`, async () => {
        mockResolved();
        const res = await call(row, `${base(WS_A)}/${invalid.path}`, { ...row.params(WS_A), ...invalid.params }, { body: row.body });
        expect(res.status).toBe(422);
        expect(row.mock).not.toHaveBeenCalled();
      });
    }
  });

  describe('POST /api/v1/me/first-workspace (user scope, global path)', () => {
    const route = { handler: postFirstWorkspace as unknown as Handler, method: 'POST' as const };
    const url = 'https://app.sineva.id/api/v1/me/first-workspace';

    it('401 without a session', async () => {
      const res = await call(route, url, {}, { unauthenticated: true });
      expect(res.status).toBe(401);
      expect(uc.createFirstWorkspace).not.toHaveBeenCalled();
    });

    it('201 creates the provisional workspace for the SESSION user, whatever the body says', async () => {
      uc.createFirstWorkspace.mockResolvedValue({ workspace: { id: WS_A, workspace_slug: 'workspace-saya-a1b2c3' }, state: { current_step: 1 } });
      const res = await call(route, url, {}, { user: 'usr-session', workspaces: [], body: { user_id: 'attacker', owner_user_id: 'attacker' } });
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.data.workspace.workspace_slug).toBe('workspace-saya-a1b2c3');
      expect(json.data.onboarding).toMatchObject({ current_step: 1 });
      expect(uc.createFirstWorkspace).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'usr-session' }));
      expect(JSON.stringify(uc.createFirstWorkspace.mock.calls[0][0])).not.toContain('attacker');
    });

    it('works with no body at all', async () => {
      uc.createFirstWorkspace.mockResolvedValue({ workspace: { id: WS_A }, state: {} });
      const res = await call(route, url, {}, { workspaces: [] });
      expect(res.status).toBe(201);
    });

    it('409 with a machine detail code when the person already has a workspace or is invited', async () => {
      for (const reason of ['already_has_workspace', 'invited_user'] as const) {
        uc.createFirstWorkspace.mockRejectedValue(new FirstWorkspaceNotAllowedError(reason));
        const res = await call(route, url, {}, { workspaces: [] });
        const json = await res.json();
        expect(res.status).toBe(409);
        expect(json.code).toBe('conflict');
        expect(json.errors[0].code).toBe(reason);
      }
    });
  });

  describe('website scan failure modes (ADR-0016) and rate limit', () => {
    const scanRoute = ROWS.find((r) => r.name === 'POST profile/scans')!;

    it('429 with rate_limited and a Retry-After header', async () => {
      uc.requestScan.mockRejectedValue(new RateLimitedError('Too many scans', 1234, 'scan_rate_limited'));
      const res = await call(scanRoute, scanRoute.path(WS_A), scanRoute.params(WS_A), { body: scanRoute.body });
      const json = await res.json();
      expect(res.status).toBe(429);
      expect(json.code).toBe('rate_limited');
      expect(json.errors[0].code).toBe('scan_rate_limited');
      expect(res.headers.get('Retry-After')).toBe('1234');
    });

    it('typed 503 when sineva-ai is unreachable, so onboarding can go on without scan results', async () => {
      uc.requestScan.mockRejectedValue(new UpstreamUnavailableError('The website reader is unavailable.', 'scan_unavailable'));
      const res = await call(scanRoute, scanRoute.path(WS_A), scanRoute.params(WS_A), { body: scanRoute.body });
      const json = await res.json();
      expect(res.status).toBe(503);
      expect(json.code).toBe('dependency_unavailable');
      expect(json.errors[0].code).toBe('scan_unavailable');
    });

    it('typed 502 for a bad answer from sineva-ai', async () => {
      uc.requestScan.mockRejectedValue(new UpstreamServiceError('The website reader returned an unexpected answer', 'scan_bad_response'));
      const res = await call(scanRoute, scanRoute.path(WS_A), scanRoute.params(WS_A), { body: scanRoute.body });
      expect(res.status).toBe(502);
      expect((await res.json()).errors[0].code).toBe('scan_bad_response');
    });
  });
});
