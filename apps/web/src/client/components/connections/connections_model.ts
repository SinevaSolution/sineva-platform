// Pure logic of the Connected tools screens: who may do what, what a status
// looks like, how the access matrix changes, which banner shows. No React and
// no network, so it is unit tested and shared by the catalog, the detail page,
// the shell banner and the specialist Tools drawer.
//
// Message keys are string literals on purpose: the key-usage test follows
// literals held by a model file, and a built key would hide them from it.

import { ApiError } from '@/client/lib/api';
import type {
  AccessLevel,
  ConnectionStatus,
  ConnectionView,
  FilterCategory,
  GrantView,
  ProviderView,
  ScopeBundleView,
  ScopeView,
} from '@/shared/connections_view';
import type { MemberRole } from '@/shared/members_view';

export type ConnectionsRole = MemberRole;

/** The shell hands the role over as a plain string; anything unknown gets the least access. */
export function toConnectionsRole(value: string): ConnectionsRole {
  return value === 'owner' || value === 'admin' || value === 'member' ? value : 'viewer';
}

// Who may do what. The server decides and enforces it: a connection carries
// its own `can` flags and a provider says whether this person may connect it.
// The UI only hides or disables what would be refused, and uses the role for the
// one thing the server cannot say, a Viewer's read-only page.

export function canConnect(role: ConnectionsRole, provider: ProviderView): 'yes' | 'ask_admin' | 'no' {
  if (role === 'viewer') return 'no';
  if (provider.can_connect_workspace || provider.can_connect_personal) return 'yes';
  return 'ask_admin';
}

/** How a provider is connected from this client: a sign-in, a pasted key, or not from here yet. */
export function connectKind(provider: ProviderView): 'consent' | 'secret' | 'unsupported' {
  if (provider.auth_type === 'oauth') return 'consent';
  if (provider.auth_type === 'api_key' && provider.credential_fields.length > 0) return 'secret';
  return 'unsupported';
}

// Status.

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'running';

export interface StatusPresentation {
  tone: StatusTone;
  /** Key in the `connections` namespace. */
  labelKey: string;
  /** A person has to do something (reconnect, allow more). Drives banners and sorting. */
  attention: boolean;
}

export function connectionStatusPresentation(status: ConnectionStatus): StatusPresentation {
  switch (status) {
    case 'connected':
      return { tone: 'success', labelKey: 'status.connected', attention: false };
    case 'partial':
      return { tone: 'warning', labelKey: 'status.partial', attention: true };
    case 'needs_reconnect':
      return { tone: 'warning', labelKey: 'status.needs_reconnect', attention: true };
    case 'error':
      return { tone: 'danger', labelKey: 'status.error', attention: false };
    case 'connecting':
      return { tone: 'running', labelKey: 'status.connecting', attention: false };
    case 'revoked':
      return { tone: 'neutral', labelKey: 'status.revoked', attention: false };
  }
}

// How a provider card looks: worst live connection wins, so one broken account
// is never hidden behind a healthy one.

export type ProviderStateKind =
  | 'coming_soon'
  | 'not_available'
  | 'paused'
  | 'connect'
  | 'connecting'
  | 'connected'
  | 'partial'
  | 'needs_reconnect'
  | 'error';

export interface ProviderState {
  kind: ProviderStateKind;
  connection: ConnectionView | null;
}

const SEVERITY: Record<ConnectionStatus, number> = {
  needs_reconnect: 5,
  error: 4,
  partial: 3,
  connecting: 2,
  connected: 1,
  revoked: 0,
};

export function providerConnections(provider: ProviderView, connections: ConnectionView[]): ConnectionView[] {
  return connections.filter((c) => c.provider_slug === provider.slug && c.status !== 'revoked');
}

export function providerState(provider: ProviderView, connections: ConnectionView[]): ProviderState {
  const live = providerConnections(provider, connections);
  const worst = live.reduce<ConnectionView | null>(
    (best, c) => (best === null || SEVERITY[c.status] > SEVERITY[best.status] ? c : best),
    null,
  );
  if (provider.availability === 'paused') return { kind: 'paused', connection: worst };
  if (worst) return { kind: worst.status as ProviderStateKind, connection: worst };
  if (provider.availability === 'coming_soon') return { kind: 'coming_soon', connection: null };
  if (provider.availability === 'credentials_missing') return { kind: 'not_available', connection: null };
  return { kind: 'connect', connection: null };
}

export function filterProviders(
  providers: ProviderView[],
  category: FilterCategory | null,
  query: string,
): ProviderView[] {
  const needle = query.trim().toLowerCase();
  return providers.filter(
    (p) =>
      (category === null || p.category === category) &&
      (needle === '' || p.name.toLowerCase().includes(needle) || p.slug.includes(needle)),
  );
}

export function providerShortName(provider: ProviderView): string {
  return provider.short_name ?? provider.name;
}

export function scopeLabel(scope: ScopeView, locale: string): string {
  return locale === 'id' ? scope.label_id : scope.label_en;
}

const readBundle = (provider: ProviderView): ScopeBundleView | null =>
  provider.bundles.find((b) => b.access_class === 'read') ?? null;
const writeBundle = (provider: ProviderView): ScopeBundleView | null =>
  provider.bundles.find((b) => b.access_class === 'write') ?? null;

/**
 * The one tier to ask for: the read tier, or the write tier when the person
 * ticked "make changes". Tiers are alternatives, so exactly one key is sent.
 * Null when the provider has no such tier (nothing can be requested).
 */
export function scopeBundleFor(provider: ProviderView, writeSelected: boolean): string | null {
  const wanted = writeSelected ? (writeBundle(provider) ?? readBundle(provider)) : readBundle(provider);
  return wanted?.key ?? null;
}

/** The scopes shown for the chosen tier, split the way the screens group them. */
export function bundleScopeGroups(
  provider: ProviderView,
  writeSelected: boolean,
): { read: ScopeView[]; change: ScopeView[] } {
  const bundle = writeSelected ? (writeBundle(provider) ?? readBundle(provider)) : readBundle(provider);
  const scopes = bundle?.scopes ?? [];
  return {
    read: scopes.filter((x) => x.access_class === 'read'),
    change: scopes.filter((x) => x.access_class !== 'read'),
  };
}

// Access matrix.

// Specialists whose ceiling is read: the server refuses a write grant for
// them, so the matrix shows text instead of a switch that could never stick.
// ASSUMED client-side until the grants payload carries the ceiling.
const READ_ONLY_SPECIALISTS: readonly string[] = ['sinoinsights'];

export interface MatrixRow {
  agent_slug: string;
  level: AccessLevel;
  /** The provider is used by this specialist's built-in skills. */
  declared: boolean;
  readOnlyByDesign: boolean;
}

export function accessMatrixRows(input: {
  provider: ProviderView;
  grants: GrantView[];
  specialists: string[];
}): MatrixRow[] {
  const { provider, grants, specialists } = input;
  const declaredFirst = provider.specialists.filter((s) => specialists.includes(s));
  const rest = specialists.filter((s) => !provider.specialists.includes(s));
  return [...declaredFirst, ...rest].map((agent_slug) => ({
    agent_slug,
    level: grants.find((g) => g.agent_slug === agent_slug)?.access_level ?? 'none',
    declared: provider.specialists.includes(agent_slug),
    readOnlyByDesign: !provider.write_supported || READ_ONLY_SPECIALISTS.includes(agent_slug),
  }));
}

/**
 * The grants after one switch moves. Write implies read; read off removes
 * write too. Returns a new array and never touches the input.
 */
export function setAccess(
  grants: GrantView[],
  agentSlug: string,
  kind: 'read' | 'write',
  on: boolean,
): GrantView[] {
  const current = grants.find((g) => g.agent_slug === agentSlug)?.access_level ?? 'none';
  let next: AccessLevel = current;
  if (kind === 'read') {
    if (!on) next = 'none';
    else if (current === 'none') next = 'read';
  } else if (on) {
    next = 'write';
  } else if (current === 'write') {
    next = 'read';
  }
  return grants.some((g) => g.agent_slug === agentSlug)
    ? grants.map((g) => (g.agent_slug === agentSlug ? { ...g, access_level: next } : g))
    : [...grants, { agent_slug: agentSlug, access_level: next }];
}

export type WriteDisabledReason = 'view_only' | 'read_only';

/** Why the "make changes" switch cannot be used, or null when it can. */
export function writeDisabledReason(
  canGrant: boolean,
  row: { readOnlyByDesign: boolean },
): WriteDisabledReason | null {
  if (!canGrant) return 'view_only';
  if (row.readOnlyByDesign) return 'read_only';
  return null;
}

// What one specialist can use (the Tools drawer on a specialist's room).

export interface SpecialistToolUse {
  connection: ConnectionView;
  level: Exclude<AccessLevel, 'none'>;
}

export interface SpecialistToolSummary {
  /** Connected tools this specialist may use now, with the level it holds. */
  using: SpecialistToolUse[];
  /** Tools its built-in skills use that nobody has connected yet and that can be connected. */
  suggested: ProviderView[];
}

export function specialistToolSummary(input: {
  connections: ConnectionView[];
  providers: ProviderView[];
  agentSlug: string;
}): SpecialistToolSummary {
  const { connections, providers, agentSlug } = input;
  const live = connections.filter((c) => c.status !== 'revoked');
  const using = live.flatMap((connection): SpecialistToolUse[] => {
    const level = connection.grants.find((g) => g.agent_slug === agentSlug)?.access_level ?? 'none';
    return level === 'none' ? [] : [{ connection, level }];
  });
  const suggested = providers.filter(
    (p) =>
      p.specialists.includes(agentSlug) &&
      (p.availability === 'available' || p.availability === 'beta') &&
      !live.some((c) => c.provider_slug === p.slug),
  );
  return { using, suggested };
}

// Reconnect banner.

export const BANNER_SNOOZE_MS = 24 * 60 * 60 * 1000;
const SNOOZE_KEY = 'sineva:connection_banner_snooze:';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Storage can be blocked or full; a banner that cannot be hidden just keeps showing. */
export function snoozeBanner(storage: KeyValueStore, connectionId: string, now: number): void {
  try {
    storage.setItem(`${SNOOZE_KEY}${connectionId}`, String(now));
  } catch {
    /* keep showing */
  }
}

export function bannerSnoozed(storage: KeyValueStore, connectionId: string, now: number): boolean {
  try {
    const at = Number(storage.getItem(`${SNOOZE_KEY}${connectionId}`));
    return Number.isFinite(at) && at > 0 && now < at + BANNER_SNOOZE_MS;
  } catch {
    return false;
  }
}

const BANNER_RANK: Partial<Record<ConnectionStatus, number>> = { needs_reconnect: 0, partial: 1 };

export interface AttentionPick {
  primary: ConnectionView;
  /** Other connections that also need attention (after snoozing). */
  more: number;
}

/**
 * The one connection the banner talks about: most severe first, then oldest.
 * Only connections this person may reconnect count (`can.reconnect`): Owner and
 * Admin see every workspace connection, a Member only their own personal one,
 * a Viewer nothing (FR-CONN-24 placement table).
 */
export function pickAttention(
  connections: ConnectionView[],
  snoozed: ReadonlySet<string> = new Set(),
): AttentionPick | null {
  const visible = connections
    .filter((c) => BANNER_RANK[c.status] !== undefined && c.can.reconnect)
    .filter((c) => !snoozed.has(c.id));
  if (visible.length === 0) return null;
  const sorted = visible
    .map((c, index) => ({ c, index }))
    .sort(
      (a, b) =>
        BANNER_RANK[a.c.status]! - BANNER_RANK[b.c.status]! ||
        (a.c.connected_at ?? '').localeCompare(b.c.connected_at ?? '') ||
        a.index - b.index,
    );
  return { primary: sorted[0]!.c, more: visible.length - 1 };
}

// OAuth return page. It reads three short codes from the query and nothing
// else: never provider text, `code` or `state`.

export type ResultVariant =
  | 'connected'
  | 'partial'
  | 'cancelled'
  | 'expired'
  | 'provider_error'
  | 'duplicate_account'
  | 'different_account';

export interface ResultQuery {
  variant: ResultVariant;
  provider: string | null;
  connectionId: string | null;
}

// The callback redirects here with `connection_result` (and, when known,
// `provider_id` and `connection_id`). Anything else is not a result.
const RESULTS: Record<string, ResultVariant> = {
  connected: 'connected',
  reconnected: 'connected',
  partial: 'partial',
  denied: 'cancelled',
  duplicate_account: 'duplicate_account',
  different_account: 'different_account',
  expired: 'expired',
  error: 'provider_error',
};

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function parseResultQuery(
  params: Record<string, string | string[] | undefined>,
): ResultQuery | null {
  const variant = RESULTS[first(params.connection_result) ?? ''];
  if (!variant) return null;
  const provider = first(params.provider_id);
  const connectionId = first(params.connection_id);
  return {
    variant,
    provider: provider && /^[a-z0-9_]{1,40}$/.test(provider) ? provider : null,
    connectionId: connectionId && /^[A-Za-z0-9_-]{1,64}$/.test(connectionId) ? connectionId : null,
  };
}

// Failures of the key form and of starting a sign-in: which sentence each gets.

export type SecretErrorKind = 'rejected' | 'duplicate' | 'rate_limited' | 'unreachable' | 'generic';

export function secretErrorKind(error: unknown): SecretErrorKind {
  if (!(error instanceof ApiError)) return 'generic';
  // The provider refused the key or the key cannot read what Sino needs; both
  // come as `connection_test_failed` and get one plain sentence.
  if (error.detailCodes.includes('connection_test_failed')) return 'rejected';
  if (error.detailCodes.includes('duplicate_account')) return 'duplicate';
  if (error.status === 429) return 'rate_limited';
  if (error.status === 0 || error.status === 502) return 'unreachable';
  if (error.status === 503 && !error.detailCodes.includes('vault_unavailable')) return 'unreachable';
  return 'generic';
}

export type StartErrorKind = 'unavailable' | 'rate_limited' | 'failed';

export function startErrorKind(error: unknown): StartErrorKind {
  if (!(error instanceof ApiError)) return 'failed';
  if (error.detailCodes.some((c) => c === 'provider_not_configured' || c === 'provider_coming_soon')) {
    return 'unavailable';
  }
  return error.status === 429 ? 'rate_limited' : 'failed';
}

// Activity: audit actions in plain words. A literal map keeps the keys visible
// to the key-usage check; an action this client does not know gets a generic line.

const ACTIVITY_KEYS: Record<string, string> = {
  'connection.oauth_started': 'activity.started',
  'connection.created': 'activity.created',
  'connection.reconnected': 'activity.reconnected',
  'connection.scope_downgraded': 'activity.fewer_permissions',
  'connection.token_refreshed': 'activity.renewed',
  'connection.refresh_failed': 'activity.renew_failed',
  'connection.needs_reconnect': 'activity.needs_reconnect',
  'connection.grant_changed': 'activity.access_changed',
  'connection.secret_rotated': 'activity.key_replaced',
  'connection.revoked': 'activity.disconnected',
};

export function activityLabelKey(action: string): string {
  return ACTIVITY_KEYS[action] ?? 'activity.generic';
}

export function activityOutcome(
  outcome: string | null,
): { tone: 'success' | 'neutral' | 'danger'; labelKey: string } | null {
  switch (outcome) {
    case 'allowed':
    case 'success':
      return { tone: 'success', labelKey: 'activity.allowed' };
    case 'denied':
      return { tone: 'neutral', labelKey: 'activity.denied' };
    case 'failed':
    case 'failure':
    case 'error':
      return { tone: 'danger', labelKey: 'activity.error' };
    default:
      return null;
  }
}
