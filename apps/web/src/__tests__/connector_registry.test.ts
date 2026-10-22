import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConnectorRegistry, IDENTIFIER, validateManifests } from '@/server/application/connections/connector_registry';
import { defineAction } from '@/server/application/connections/manifests/define';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import type { ActionDefinition, ProviderManifest } from '@/server/domain/connections/connector';
import { SPECIALIST_MANIFEST } from '@/shared/specialists/manifest';
import { SPECIALIST_CONNECTION_PROVIDERS, specialistsDeclaring } from '@/shared/specialists/connection_providers';

// WP-M2-09 (FR-CONN-04, FR-CONN-05, FR-CONN-25, FR-CONN-26, FR-CONN-32, FR-SKILL-07):
// the manifests are data, so these tests walk the data.

const registry = () =>
  new ConnectorRegistry(PROVIDER_MANIFESTS, {
    credentialsAvailable: () => true,
    specialistsFor: specialistsDeclaring,
  });

const allActions = () => PROVIDER_MANIFESTS.flatMap((manifest) => manifest.actions);

describe('provider manifests (ADR-0037)', () => {
  it('list the four launch providers and the coming soon catalog entries', () => {
    const ids = PROVIDER_MANIFESTS.map((manifest) => manifest.provider_id);
    for (const id of ['google_calendar', 'notion', 'xendit', 'midtrans']) expect(ids).toContain(id);
    const soon = PROVIDER_MANIFESTS.filter((manifest) => manifest.status === 'coming_soon');
    expect(soon.length).toBeGreaterThanOrEqual(3);
    for (const manifest of soon) {
      expect(manifest.actions).toEqual([]);
      expect(manifest.oauth).toBeUndefined();
    }
  });

  it('pass the registry self-check, and the registry constructs', () => {
    expect(validateManifests(PROVIDER_MANIFESTS)).toEqual([]);
    expect(() => registry()).not.toThrow();
  });

  it('every action id matches the snake_case pattern and starts with its provider', () => {
    expect(allActions().length).toBeGreaterThan(8);
    for (const action of allActions()) {
      expect(action.action_id).toMatch(IDENTIFIER);
      expect(action.action_id.startsWith(`${action.provider_id}_`)).toBe(true);
    }
  });

  it('every scope has English and Indonesian labels and an access class (FR-CONN-05)', () => {
    for (const manifest of PROVIDER_MANIFESTS) {
      for (const scope of manifest.scopes) {
        expect(scope.label.en.trim(), `${manifest.provider_id} ${scope.scope_key}`).not.toBe('');
        expect(scope.label.id.trim(), `${manifest.provider_id} ${scope.scope_key}`).not.toBe('');
        expect(['read', 'write', 'admin']).toContain(scope.access_class);
      }
    }
  });

  it('no action has the pay side effect, and every payment provider action is read', () => {
    for (const action of allActions()) expect(action.side_effect).not.toBe('pay');
    const payments = PROVIDER_MANIFESTS.filter((manifest) => manifest.category === 'payments');
    expect(payments.map((manifest) => manifest.provider_id).sort()).toEqual(['midtrans', 'xendit']);
    for (const manifest of payments) {
      expect(manifest.actions.length).toBeGreaterThan(0);
      for (const action of manifest.actions) expect(action.side_effect).toBe('read');
    }
  });

  it('writes are never autonomy eligible and need an approval sentence in both languages', () => {
    for (const action of allActions()) {
      if (action.side_effect !== 'read') expect(action.autonomy_eligible, action.action_id).toBe(false);
      expect(action.approval_sentence_template.en.trim()).not.toBe('');
      expect(action.approval_sentence_template.id.trim()).not.toBe('');
    }
  });

  it('every action has input and output schemas that parse and a response cap', () => {
    for (const action of allActions()) {
      expect(typeof action.input_schema.safeParse).toBe('function');
      expect(typeof action.output_schema.safeParse).toBe('function');
      expect(action.max_response_bytes).toBeGreaterThan(0);
    }
  });

  it('an OAuth provider has https endpoints, bundles and credential keys; an API-key provider has fields and a test', () => {
    for (const manifest of PROVIDER_MANIFESTS.filter((m) => m.status !== 'coming_soon')) {
      if (manifest.auth_type === 'oauth2_pkce') {
        expect(manifest.oauth?.authorize_url).toMatch(/^https:\/\//);
        expect(manifest.oauth?.token_url).toMatch(/^https:\/\//);
        expect(manifest.oauth?.credential_keys.client_id).toBeTruthy();
        expect(manifest.bundles.length).toBeGreaterThan(0);
      } else {
        expect(manifest.api_key?.fields.some((field) => field.kind === 'secret')).toBe(true);
        expect(manifest.api_key?.test.accept_statuses.length).toBeGreaterThan(0);
        // Personal API keys do not exist in v1.0: shared payment credentials are workspace-owned.
        expect(manifest.personal_capable).toBe(false);
      }
    }
  });

  it('only Google Calendar is personal capable (OQ-CONN-7 default)', () => {
    expect(PROVIDER_MANIFESTS.filter((m) => m.personal_capable).map((m) => m.provider_id)).toEqual(['google_calendar']);
  });

  it('keeps provider credentials out of the manifest: only env key names appear', () => {
    const text = JSON.stringify(PROVIDER_MANIFESTS, (_key, value) => (typeof value === 'function' ? undefined : value));
    expect(text).not.toMatch(/secret_[A-Za-z0-9]{30,}|xnd_(development|production)_/);
    for (const manifest of PROVIDER_MANIFESTS) {
      if (manifest.oauth) {
        expect(manifest.oauth.credential_keys.client_secret).toMatch(/^[a-z_]+$/);
      }
    }
  });
});

// Zod schemas are not structured-cloneable, so copy only the parts a test edits.
function cloneGoogle(): ProviderManifest {
  const google = PROVIDER_MANIFESTS.find((manifest) => manifest.provider_id === 'google_calendar')!;
  return {
    ...google,
    scopes: google.scopes.map((scope) => ({ ...scope, label: { ...scope.label } })),
    oauth: { ...google.oauth! },
    actions: [],
  };
}

describe('registry self-check rejects bad manifests', () => {
  const sample = (): ProviderManifest => structuredClone({
    ...PROVIDER_MANIFESTS.find((manifest) => manifest.provider_id === 'xendit')!,
    actions: [],
  }) as ProviderManifest;

  const action = (over: Partial<ActionDefinition>): ActionDefinition => ({
    action_id: 'xendit_get_balance',
    provider_id: 'xendit',
    side_effect: 'read',
    scopes: [],
    risk_level: 'low',
    reversible: true,
    autonomy_eligible: true,
    guardrail_locked: false,
    approval_sentence_template: { en: 'Read the balance', id: 'Baca saldo' },
    input_schema: z.object({}),
    output_schema: z.object({}),
    display_card_type: null,
    activity_label_key: 'connections.activity.xendit_get_balance',
    max_response_bytes: 1000,
    ...over,
  });

  it('a dotted action id', () => {
    const manifest = sample();
    manifest.actions = [action({ action_id: 'xendit.get_balance' })];
    expect(validateManifests([manifest]).join('\n')).toMatch(/xendit\.get_balance.*must match/);
  });

  it('a pay side effect smuggled in through a cast', () => {
    const manifest = sample();
    manifest.actions = [action({ side_effect: 'pay' as unknown as 'read' })];
    expect(validateManifests([manifest]).join('\n')).toMatch(/not assignable/);
  });

  it('a payment provider action that writes', () => {
    const manifest = sample();
    manifest.actions = [action({ side_effect: 'write_external' })];
    expect(validateManifests([manifest]).join('\n')).toMatch(/payment provider actions must all be read/);
  });

  it('a scope without an Indonesian label', () => {
    const manifest = cloneGoogle();
    manifest.scopes[0]!.label.id = '';
    expect(validateManifests([manifest]).join('\n')).toMatch(/needs English and Indonesian labels/);
  });

  it('a duplicate provider or action id', () => {
    const manifest = sample();
    expect(validateManifests([manifest, manifest]).join('\n')).toMatch(/defined twice/);
  });

  it('an egress host with a wildcard or scheme', () => {
    const manifest = sample();
    manifest.egress = [{ host: '*.xendit.co', path_prefixes: ['/'] }, { host: 'https://api.xendit.co', path_prefixes: ['/'] }];
    expect(validateManifests([manifest]).join('\n')).toMatch(/bare host name/);
  });

  it('an OAuth URL that is not https', () => {
    const manifest = cloneGoogle();
    manifest.oauth!.token_url = 'http://oauth2.googleapis.com/token';
    expect(validateManifests([manifest]).join('\n')).toMatch(/must be https/);
  });

  it('the constructor throws instead of starting with invalid data', () => {
    const manifest = sample();
    manifest.actions = [action({ action_id: 'Bad-Id' })];
    expect(() => new ConnectorRegistry([manifest], { credentialsAvailable: () => true, specialistsFor: () => [] })).toThrow(
      /Invalid connector manifests/,
    );
  });
});

describe('pay is not constructible (FR-SKILL-08)', () => {
  it('the helper that builds actions does not accept it, at compile time', () => {
    const build = () =>
      defineAction({
        action_id: 'xendit_pay_invoice',
        provider_id: 'xendit',
        // @ts-expect-error 'pay' is not an AssignableSideEffect: tsc fails this line if the type ever allows it
        side_effect: 'pay',
        scopes: [],
        input_schema: z.object({}),
        output_schema: z.object({}),
        sentence: { en: 'Pay', id: 'Bayar' },
      });
    // Building it at runtime still produces data that the self-check rejects.
    const manifest = { ...PROVIDER_MANIFESTS.find((m) => m.provider_id === 'xendit')!, actions: [build()] };
    expect(validateManifests([manifest]).join('\n')).toMatch(/not assignable/);
  });
});

describe('ConnectorRegistry lookups', () => {
  it('reports coming soon providers and providers without credentials as unavailable with a reason', () => {
    const none = new ConnectorRegistry(PROVIDER_MANIFESTS, {
      credentialsAvailable: (manifest) => manifest.auth_type === 'api_key',
      specialistsFor: specialistsDeclaring,
    });
    expect(none.availability('google_calendar')).toEqual({ available: false, reason: 'credentials_not_configured' });
    expect(none.availability('xendit')).toEqual({ available: true, reason: null });
    const soon = PROVIDER_MANIFESTS.find((m) => m.status === 'coming_soon')!;
    expect(none.availability(soon.provider_id)).toEqual({ available: false, reason: 'coming_soon' });
    expect(none.availability('nope')).toEqual({ available: false, reason: 'coming_soon' });
  });

  it('resolves scopes, bundles and actions', () => {
    const r = registry();
    const bundle = r.bundle('google_calendar', 'calendar_read')!;
    expect(bundle.scope_keys.length).toBeGreaterThan(0);
    expect(r.bundleScopes('google_calendar', 'calendar_read').length).toBe(bundle.scope_keys.length);
    expect(r.action('google_calendar_list_events')?.side_effect).toBe('read');
    expect(r.action('google_calendar_create_event')?.side_effect).toBe('write_external');
    expect(r.action('nope')).toBeNull();
    expect(r.bundle('google_calendar', 'nope')).toBeNull();
  });

  it('knows which providers are read-only (write grants are refused for them)', () => {
    const r = registry();
    expect(r.isReadOnlyProvider('xendit')).toBe(true);
    expect(r.isReadOnlyProvider('midtrans')).toBe(true);
    expect(r.isReadOnlyProvider('google_calendar')).toBe(false);
  });

  it('enforces the egress allowlist: https, exact host, allowed path', () => {
    const r = registry();
    expect(r.isEgressAllowed('google_calendar', 'https://www.googleapis.com/calendar/v3/calendars/primary/events')).toBe(true);
    expect(r.isEgressAllowed('google_calendar', 'http://www.googleapis.com/calendar/v3/events')).toBe(false);
    expect(r.isEgressAllowed('google_calendar', 'https://www.googleapis.com/drive/v3/files')).toBe(false);
    expect(r.isEgressAllowed('google_calendar', 'https://evil.example/calendar/v3/events')).toBe(false);
    expect(r.isEgressAllowed('google_calendar', 'https://www.googleapis.com.evil.example/calendar/v3/')).toBe(false);
    expect(r.isEgressAllowed('google_calendar', 'https://user:pw@www.googleapis.com/calendar/v3/')).toBe(false);
    expect(r.isEgressAllowed('google_calendar', 'not a url')).toBe(false);
    expect(r.isEgressAllowed('nope', 'https://www.googleapis.com/calendar/v3/')).toBe(false);
    expect(r.isEgressAllowed('xendit', 'https://api.xendit.co/balance')).toBe(true);
    expect(r.isEgressAllowed('xendit', 'https://api.midtrans.com/v2/x/status')).toBe(false);
  });
});

describe('specialists that declare a provider (ADR-0039 decision 4)', () => {
  const slugs = SPECIALIST_MANIFEST.map((entry) => entry.agent_slug);

  it('only names specialists that exist in the manifest and providers that exist', () => {
    const providerIds = new Set(PROVIDER_MANIFESTS.map((manifest) => manifest.provider_id));
    for (const [slug, providers] of Object.entries(SPECIALIST_CONNECTION_PROVIDERS)) {
      expect(slugs, slug).toContain(slug);
      for (const provider of providers) expect(providerIds.has(provider), `${slug} -> ${provider}`).toBe(true);
    }
  });

  it('gives each launch provider at least one specialist, and SinoFinance the payment providers', () => {
    for (const id of ['google_calendar', 'notion', 'xendit', 'midtrans']) {
      expect(specialistsDeclaring(id).length, id).toBeGreaterThan(0);
    }
    expect(specialistsDeclaring('xendit')).toContain('sinofinance');
    expect(specialistsDeclaring('midtrans')).toContain('sinofinance');
  });

  it('returns slugs in manifest order and an empty list for an unknown provider', () => {
    const order = specialistsDeclaring('google_calendar');
    expect([...order].sort((a, b) => slugs.indexOf(a) - slugs.indexOf(b))).toEqual(order);
    expect(specialistsDeclaring('nope')).toEqual([]);
  });
});
