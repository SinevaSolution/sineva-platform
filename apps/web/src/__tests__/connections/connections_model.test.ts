import { describe, expect, it } from 'vitest';
import {
  BANNER_SNOOZE_MS,
  accessMatrixRows,
  activityLabelKey,
  activityOutcome,
  bannerSnoozed,
  bundleScopeGroups,
  canConnect,
  connectKind,
  connectionStatusPresentation,
  filterProviders,
  parseResultQuery,
  pickAttention,
  providerState,
  scopeBundleFor,
  secretErrorKind,
  setAccess,
  snoozeBanner,
  specialistToolSummary,
  startErrorKind,
  toConnectionsRole,
  writeDisabledReason,
} from '@/client/components/connections/connections_model';
import { ApiError } from '@/client/lib/api';
import { canFor, connection, grants, provider, readScope, writeScope } from './fixtures';

describe('status mapping', () => {
  it.each([
    ['connected', 'success', false],
    ['partial', 'warning', true],
    ['needs_reconnect', 'warning', true],
    ['error', 'danger', false],
    ['connecting', 'running', false],
    ['revoked', 'neutral', false],
  ] as const)('%s is %s (needs a person: %s)', (status, tone, attention) => {
    const p = connectionStatusPresentation(status);
    expect(p.tone).toBe(tone);
    expect(p.attention).toBe(attention);
  });

  it('uses the plain words from the brief', () => {
    expect(connectionStatusPresentation('connected').labelKey).toBe('status.connected');
    expect(connectionStatusPresentation('needs_reconnect').labelKey).toBe('status.needs_reconnect');
  });
});

describe('provider card state', () => {
  it('coming soon and credentials missing are not connectable', () => {
    expect(providerState(provider({ availability: 'coming_soon' }), []).kind).toBe('coming_soon');
    expect(providerState(provider({ availability: 'credentials_missing' }), []).kind).toBe('not_available');
    expect(providerState(provider({ availability: 'paused' }), []).kind).toBe('paused');
  });

  it('a provider with no live connection offers Connect, beta included', () => {
    expect(providerState(provider(), []).kind).toBe('connect');
    expect(providerState(provider({ availability: 'beta' }), []).kind).toBe('connect');
  });

  it('ignores revoked connections and other providers', () => {
    const state = providerState(provider(), [
      connection({ status: 'revoked' }),
      connection({ id: 'b', provider_slug: 'xendit' }),
    ]);
    expect(state.kind).toBe('connect');
  });

  it('shows the worst status when a provider has several connections', () => {
    const ok = connection({ id: 'a' });
    const broken = connection({ id: 'b', status: 'needs_reconnect' });
    const partial = connection({ id: 'c', status: 'partial' });
    expect(providerState(provider(), [ok]).kind).toBe('connected');
    expect(providerState(provider(), [ok, partial]).kind).toBe('partial');
    const worst = providerState(provider(), [ok, partial, broken]);
    expect(worst.kind).toBe('needs_reconnect');
    expect(worst.connection?.id).toBe('b');
  });

  it('a provider paused by Sineva shows as paused even when connected', () => {
    expect(providerState(provider({ availability: 'paused' }), [connection()]).kind).toBe('paused');
  });
});

describe('filters', () => {
  const all = [
    provider({ slug: 'xendit', name: 'Xendit', category: 'payments' }),
    provider({ slug: 'notion', name: 'Notion', category: 'docs' }),
    provider({ slug: 'google_calendar', name: 'Google Calendar', category: 'calendar' }),
  ];

  it('filters by category and by name, case-insensitively', () => {
    expect(filterProviders(all, null, '').map((p) => p.slug)).toHaveLength(3);
    expect(filterProviders(all, 'payments', '').map((p) => p.slug)).toEqual(['xendit']);
    expect(filterProviders(all, null, 'CAL').map((p) => p.slug)).toEqual(['google_calendar']);
    expect(filterProviders(all, 'docs', 'xen')).toEqual([]);
  });
});

describe('who may connect', () => {
  it('follows what the server says this person may create, and a viewer never connects', () => {
    expect(canConnect('admin', provider())).toBe('yes');
    expect(canConnect('member', provider({ can_connect_workspace: false, can_connect_personal: false }))).toBe('ask_admin');
    expect(canConnect('member', provider({ can_connect_workspace: false, can_connect_personal: true }))).toBe('yes');
    expect(canConnect('viewer', provider({ can_connect_personal: true }))).toBe('no');
  });

  it('knows which tools open a sign-in, which a key form and which this client cannot connect yet', () => {
    expect(connectKind(provider())).toBe('consent');
    const key = provider({
      auth_type: 'api_key',
      credential_fields: [{ field_key: 'k', label_en: 'Key', label_id: 'Kunci', kind: 'secret', choices: [] }],
    });
    expect(connectKind(key)).toBe('secret');
    expect(connectKind({ ...key, credential_fields: [] })).toBe('unsupported');
    expect(connectKind(provider({ auth_type: 'embedded_signup' }))).toBe('unsupported');
    expect(connectKind(provider({ auth_type: 'hmac' }))).toBe('unsupported');
  });
});

describe('access tiers', () => {
  it('asks for the read tier, or the write tier when changes were ticked, never both keys', () => {
    expect(scopeBundleFor(provider(), false)).toBe('read');
    expect(scopeBundleFor(provider(), true)).toBe('read_write');
  });

  it('falls back to the read tier when there is no write tier, and to nothing when there is no tier', () => {
    const readOnly = provider({ bundles: [{ key: 'read', access_class: 'read', scopes: [readScope] }], write_supported: false });
    expect(scopeBundleFor(readOnly, true)).toBe('read');
    expect(scopeBundleFor(provider({ bundles: [] }), false)).toBeNull();
  });

  it('splits the chosen tier into what Sino can read and what it can change', () => {
    expect(bundleScopeGroups(provider(), false)).toEqual({ read: [readScope], change: [] });
    expect(bundleScopeGroups(provider(), true)).toEqual({ read: [readScope], change: [writeScope] });
  });
});

describe('access matrix', () => {
  it('lists declared specialists first, then the rest, with their level', () => {
    const rows = accessMatrixRows({
      provider: provider(),
      grants: grants(['sinofinance', 'write']),
      specialists: ['sinopeople', 'sinofinance', 'sinoinsights'],
    });
    expect(rows.map((r) => r.agent_slug)).toEqual(['sinofinance', 'sinoinsights', 'sinopeople']);
    expect(rows.map((r) => r.level)).toEqual(['write', 'none', 'none']);
    expect(rows.map((r) => r.declared)).toEqual([true, true, false]);
  });

  it('sinoinsights is read only by design', () => {
    const rows = accessMatrixRows({
      provider: provider(),
      grants: [],
      specialists: ['sinoinsights', 'sinofinance'],
    });
    expect(rows.find((r) => r.agent_slug === 'sinoinsights')?.readOnlyByDesign).toBe(true);
    expect(rows.find((r) => r.agent_slug === 'sinofinance')?.readOnlyByDesign).toBe(false);
  });

  it('a provider without a write tier makes every row read only', () => {
    const rows = accessMatrixRows({
      provider: provider({ write_supported: false }),
      grants: [],
      specialists: ['sinofinance'],
    });
    expect(rows[0]?.readOnlyByDesign).toBe(true);
  });

  it('turning write on implies read, turning read off removes write too', () => {
    const base = grants(['sinofinance', 'none']);
    expect(setAccess(base, 'sinofinance', 'write', true)).toEqual(grants(['sinofinance', 'write']));
    expect(setAccess(grants(['sinofinance', 'write']), 'sinofinance', 'write', false)).toEqual(
      grants(['sinofinance', 'read']),
    );
    expect(setAccess(grants(['sinofinance', 'write']), 'sinofinance', 'read', false)).toEqual(
      grants(['sinofinance', 'none']),
    );
    expect(setAccess(grants(['sinofinance', 'write']), 'sinofinance', 'read', true)).toEqual(
      grants(['sinofinance', 'write']),
    );
  });

  it('adds a grant for a specialist that had none and does not mutate the input', () => {
    const base = grants(['sinofinance', 'read']);
    const next = setAccess(base, 'sinosales', 'read', true);
    expect(next).toEqual(grants(['sinofinance', 'read'], ['sinosales', 'read']));
    expect(base).toEqual(grants(['sinofinance', 'read']));
  });

  it('explains why Write is off: view only without the server permission, or read only by design', () => {
    expect(writeDisabledReason(true, { readOnlyByDesign: false })).toBeNull();
    expect(writeDisabledReason(false, { readOnlyByDesign: false })).toBe('view_only');
    expect(writeDisabledReason(false, { readOnlyByDesign: true })).toBe('view_only');
    expect(writeDisabledReason(true, { readOnlyByDesign: true })).toBe('read_only');
  });
});

describe('reconnect banner choice', () => {
  const list = [
    connection({ id: 'ok' }),
    connection({ id: 'partial', status: 'partial' }),
    connection({ id: 'broken', status: 'needs_reconnect' }),
    connection({ id: 'broken2', status: 'needs_reconnect' }),
  ];

  it('picks needs reconnect before partial and counts the rest', () => {
    const pick = pickAttention(list);
    expect(pick?.primary.id).toBe('broken');
    expect(pick?.more).toBe(2);
  });

  it('shows nothing when everything works', () => {
    expect(pickAttention([connection()])).toBeNull();
  });

  it('counts only connections this person may reconnect: a member sees their own personal one, a viewer none', () => {
    const asMember = list.map((c) => ({ ...c, can: canFor('member') }));
    expect(pickAttention(asMember)).toBeNull();
    const mine = connection({
      id: 'mine',
      status: 'needs_reconnect',
      owner_scope: 'user',
      owned_by_me: true,
      can: canFor('member', true),
    });
    expect(pickAttention([...asMember, mine])?.primary.id).toBe('mine');
    expect(pickAttention(list.map((c) => ({ ...c, can: canFor('viewer') })))).toBeNull();
  });

  it('skips snoozed connections', () => {
    expect(pickAttention(list, new Set(['broken']))?.primary.id).toBe('broken2');
  });
});

describe('banner snooze', () => {
  const store = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it('hides for 24 hours, then shows again', () => {
    const storage = store();
    const now = 1_000_000;
    snoozeBanner(storage, 'abc', now);
    expect(bannerSnoozed(storage, 'abc', now + BANNER_SNOOZE_MS - 1)).toBe(true);
    expect(bannerSnoozed(storage, 'abc', now + BANNER_SNOOZE_MS)).toBe(false);
    expect(bannerSnoozed(storage, 'other', now)).toBe(false);
  });

  it('keeps showing the banner when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => snoozeBanner(broken, 'abc', 1)).not.toThrow();
    expect(bannerSnoozed(broken, 'abc', 2)).toBe(false);
  });
});

describe('return page query', () => {
  it('maps the callback results to a variant', () => {
    expect(parseResultQuery({ connection_result: 'connected', provider_id: 'xendit', connection_id: 'c1' })).toEqual({
      variant: 'connected',
      provider: 'xendit',
      connectionId: 'c1',
    });
    expect(parseResultQuery({ connection_result: 'reconnected' })?.variant).toBe('connected');
    expect(parseResultQuery({ connection_result: 'partial', provider_id: 'notion' })?.variant).toBe('partial');
    expect(parseResultQuery({ connection_result: 'denied' })?.variant).toBe('cancelled');
    expect(parseResultQuery({ connection_result: 'expired' })?.variant).toBe('expired');
    expect(parseResultQuery({ connection_result: 'duplicate_account' })?.variant).toBe('duplicate_account');
    expect(parseResultQuery({ connection_result: 'different_account' })?.variant).toBe('different_account');
    expect(parseResultQuery({ connection_result: 'error' })?.variant).toBe('provider_error');
  });

  it('rejects anything that is not a known result, so the address cannot make the page say something', () => {
    expect(parseResultQuery({ connection_result: '<script>' })).toBeNull();
    expect(parseResultQuery({ connection_result: 'weird' })).toBeNull();
    expect(parseResultQuery({ status: 'connected' })).toBeNull();
    expect(parseResultQuery({})).toBeNull();
  });

  it('takes the first value of a repeated parameter and drops ids that are not plain', () => {
    expect(parseResultQuery({ connection_result: ['connected', 'error'], provider_id: ['a', 'b'] })?.provider).toBe('a');
    expect(parseResultQuery({ connection_result: 'connected', provider_id: 'Not Plain!' })?.provider).toBeNull();
    expect(parseResultQuery({ connection_result: 'connected', connection_id: '../x' })?.connectionId).toBeNull();
  });
});

describe('key form errors', () => {
  const err = (status: number, code: string, details: string[] = []) => new ApiError('x', status, code, details);

  it.each([
    [err(422, 'validation_failed', ['connection_test_failed']), 'rejected'],
    [err(409, 'conflict', ['duplicate_account']), 'duplicate'],
    [err(429, 'rate_limited'), 'rate_limited'],
    [err(503, 'dependency_unavailable', ['provider_unreachable']), 'unreachable'],
    [err(502, 'dependency_unavailable'), 'unreachable'],
    [err(0, 'network'), 'unreachable'],
    [err(503, 'dependency_unavailable', ['vault_unavailable']), 'generic'],
    [err(500, 'internal_error'), 'generic'],
    [new Error('x'), 'generic'],
  ] as const)('%#', (error, kind) => {
    expect(secretErrorKind(error)).toBe(kind);
  });

  it('start failures: an unconfigured or coming soon provider says so, the rest is a plain failure', () => {
    expect(startErrorKind(err(409, 'conflict', ['provider_not_configured']))).toBe('unavailable');
    expect(startErrorKind(err(409, 'conflict', ['provider_coming_soon']))).toBe('unavailable');
    expect(startErrorKind(err(429, 'rate_limited'))).toBe('rate_limited');
    expect(startErrorKind(err(500, 'internal_error'))).toBe('failed');
    expect(startErrorKind(new Error('x'))).toBe('failed');
  });
});

describe('activity wording', () => {
  it('turns audit actions into plain words and falls back for an unknown one', () => {
    expect(activityLabelKey('connection.grant_changed')).toBe('activity.access_changed');
    expect(activityLabelKey('connection.revoked')).toBe('activity.disconnected');
    expect(activityLabelKey('connection.something_new')).toBe('activity.generic');
  });

  it('badges only outcomes it knows', () => {
    expect(activityOutcome('denied')?.tone).toBe('neutral');
    expect(activityOutcome('failure')?.tone).toBe('danger');
    expect(activityOutcome('success')?.tone).toBe('success');
    expect(activityOutcome('whatever')).toBeNull();
    expect(activityOutcome(null)).toBeNull();
  });
});

describe('specialist tools', () => {
  const xendit = provider({ slug: 'xendit', specialists: ['sinofinance'] });
  const jurnal = provider({ specialists: ['sinofinance'] });
  const soon = provider({ slug: 'shopee', availability: 'coming_soon', specialists: ['sinofinance'] });

  it('lists connected tools the specialist holds, with their level, and ignores the rest', () => {
    const summary = specialistToolSummary({
      agentSlug: 'sinofinance',
      providers: [jurnal],
      connections: [
        connection({ id: 'a', grants: grants(['sinofinance', 'write']) }),
        connection({ id: 'b', grants: grants(['sinosales', 'read']) }),
        connection({ id: 'c', grants: grants(['sinofinance', 'none']) }),
        connection({ id: 'd', status: 'revoked', grants: grants(['sinofinance', 'read']) }),
      ],
    });
    expect(summary.using.map((u) => [u.connection.id, u.level])).toEqual([['a', 'write']]);
  });

  it('suggests only connectable tools its skills use that nobody connected', () => {
    const summary = specialistToolSummary({
      agentSlug: 'sinofinance',
      providers: [jurnal, xendit, soon, provider({ slug: 'notion', specialists: [] })],
      connections: [connection({ grants: grants(['sinofinance', 'read']) })],
    });
    expect(summary.suggested.map((p) => p.slug)).toEqual(['xendit']);
  });
});

describe('role from the shell', () => {
  it('keeps the four roles and gives anything else the least access', () => {
    expect(toConnectionsRole('owner')).toBe('owner');
    expect(toConnectionsRole('member')).toBe('member');
    expect(toConnectionsRole('superuser')).toBe('viewer');
    expect(toConnectionsRole('')).toBe('viewer');
  });
});
