// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SNTooltipProvider } from '@sineva/ui';
import { AccessMatrix } from '@/client/components/connections/access_matrix';
import {
  ConnectionsAttentionProvider,
  ShellReconnectBanner,
} from '@/client/components/connections/connections_attention';
import { ConnectionsCatalog } from '@/client/components/connections/connections_catalog';
import type { ConnectionsRole } from '@/client/components/connections/connections_model';
import { ConnectResult } from '@/client/components/connections/connect_result';
import { ConnectionDetail } from '@/client/components/connections/connection_detail';
import { SpecialistToolsButton } from '@/client/components/connections/specialist_tools';
import type { ConnectionsApi } from '@/client/lib/connections_api';
import { ApiError } from '@/client/lib/api';
import { CATALOGS } from '@/i18n/catalogs';
import { I18nProvider } from '@/i18n/provider';
import { localizeSpecialists } from '@/shared/specialists/manifest';
import type { ConnectionView, ProviderView } from '@/shared/connections_view';
import { canFor, connection, grants, provider, readScope, writeScope } from './fixtures';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: '/w/acme/tools' }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => nav.pathname,
}));

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  nav.pathname = '/w/acme/tools';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const specialists = localizeSpecialists('en');

const xendit = provider({
  slug: 'xendit',
  name: 'Xendit',
  short_name: null,
  category: 'payments',
  auth_type: 'api_key',
  credential_fields: [
    { field_key: 'secret_key', label_en: 'Secret API key', label_id: 'Secret API key', kind: 'secret', choices: [] },
    { field_key: 'environment', label_en: 'Environment', label_id: 'Lingkungan', kind: 'choice', choices: ['production', 'sandbox'] },
  ],
  read_only_notice: true,
  write_supported: false,
  bundles: [{ key: 'read', access_class: 'read', scopes: [readScope] }],
  specialists: ['sinofinance'],
});
const catalogOf = (): ProviderView[] => [
  provider(),
  xendit,
  provider({ slug: 'notion', name: 'Notion', short_name: null, category: 'docs', availability: 'beta', specialists: [] }),
  provider({ slug: 'midtrans', name: 'Midtrans', short_name: null, category: 'payments', availability: 'credentials_missing' }),
  provider({ slug: 'whatsapp_business', name: 'WhatsApp Business', short_name: 'WhatsApp', category: 'messaging', availability: 'coming_soon' }),
];
/** What the server says each role may connect: managers everything, members nothing shared, viewers nothing. */
const catalogFor = (role: ConnectionsRole, personal = false): ProviderView[] =>
  catalogOf().map((p) => ({
    ...p,
    can_connect_workspace: role === 'owner' || role === 'admin',
    can_connect_personal: role !== 'viewer' && (personal || role === 'owner' || role === 'admin'),
  }));

function fakeApi(over: Partial<ConnectionsApi> & { connections?: ConnectionView[]; providers?: ProviderView[] } = {}): ConnectionsApi {
  const { connections = [], providers = catalogOf(), ...rest } = over;
  return {
    listProviders: vi.fn().mockResolvedValue(providers),
    listConnections: vi.fn().mockResolvedValue(connections),
    getConnection: vi.fn().mockResolvedValue(connections[0] ?? connection()),
    startOAuth: vi.fn().mockResolvedValue('https://provider.example/authorize'),
    saveSecret: vi.fn().mockResolvedValue(connection({ provider_slug: 'xendit', provider_name: 'Xendit' })),
    reconnect: vi.fn().mockResolvedValue('https://provider.example/reauthorize'),
    testConnection: vi.fn().mockResolvedValue({ ok: true, checked_at: 'now', status: 'connected' }),
    updateGrants: vi.fn().mockImplementation(async (_id: string, g) => g),
    disconnect: vi.fn().mockResolvedValue({ provider_revoked: true }),
    listActivity: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    ...rest,
  };
}

function wrap(ui: React.ReactNode, locale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider locale={locale} messages={CATALOGS[locale]}>
      <SNTooltipProvider>{ui}</SNTooltipProvider>
    </I18nProvider>,
  );
}

function catalog(
  api: ConnectionsApi,
  role: ConnectionsRole = 'admin',
  extra: Partial<React.ComponentProps<typeof ConnectionsCatalog>> = {},
) {
  return wrap(
    <ConnectionsCatalog
      workspaceId="ws-1"
      workspaceSlug="acme"
      workspaceName="Acme"
      role={role}
      specialists={specialists}
      api={api}
      navigate={vi.fn()}
      {...extra}
    />,
  );
}

describe('catalog', () => {
  it('shows the hero line and a skeleton, then the cards with the right status per provider', async () => {
    catalog(fakeApi({ connections: [connection({ status: 'needs_reconnect' })] }));
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(await screen.findByText(/Connect the tools you already use/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Connected tools' })).toBeTruthy();
    // Connected section: the broken connection says so and offers Reconnect.
    expect(screen.getByText('Needs reconnecting')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconnect Jurnal' })).toBeTruthy();
    // Available: connect buttons, a beta badge, and the honest "not available yet".
    expect(screen.getByRole('button', { name: 'Connect Xendit' })).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('Not available yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect Midtrans' })).toBeNull();
  });

  it('uses the purpose the server sends, in the active language', async () => {
    const withText = catalogOf().map((p) =>
      p.slug === 'xendit' ? { ...p, description_en: 'Reads your payments.', description_id: 'Membaca pembayaranmu.' } : p,
    );
    catalog(fakeApi({ providers: withText }));
    expect(await screen.findByText('Reads your payments.')).toBeTruthy();
  });

  it('keeps coming soon tools out of reach: collapsed, then plain list items without links or buttons', async () => {
    catalog(fakeApi());
    const toggle = await screen.findByRole('button', { name: /Coming soon \(1\)/ });
    expect(screen.queryByText('WhatsApp Business')).toBeNull();
    fireEvent.click(toggle);
    const item = screen.getByText('WhatsApp Business').closest('li')!;
    expect(within(item).queryByRole('link')).toBeNull();
    expect(within(item).queryByRole('button')).toBeNull();
  });

  it('shows the calm empty state when nothing is connected', async () => {
    catalog(fakeApi());
    expect(await screen.findByText('No tools connected yet')).toBeTruthy();
  });

  it('filters by category and offers a way out when nothing matches', async () => {
    catalog(fakeApi());
    await screen.findByText(/Connect the tools/);
    fireEvent.click(screen.getByRole('radio', { name: 'Payments' }));
    expect(screen.getByRole('button', { name: 'Connect Xendit' })).toBeTruthy();
    expect(screen.queryByText('Notion')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tools' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No tools match "zzz"')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: 'Connect Xendit' })).toBeTruthy();
    expect(screen.getByText('Notion')).toBeTruthy();
  });

  it('puts the filters in the URL after a pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      catalog(fakeApi());
      await screen.findByText(/Connect the tools/);
      fireEvent.click(screen.getByRole('radio', { name: 'Docs' }));
      await act(async () => void vi.advanceTimersByTime(400));
      expect(router.replace).toHaveBeenLastCalledWith('/w/acme/tools?category=docs', { scroll: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a member sees "Ask an admin" on workspace tools and a viewer sees no connect button at all', async () => {
    const { unmount } = catalog(fakeApi({ providers: catalogFor('member') }), 'member');
    await screen.findByText(/Connect the tools/);
    expect(screen.getAllByText('Ask an admin to connect').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Connect / })).toBeNull();
    unmount();
    catalog(fakeApi({ providers: catalogFor('viewer') }), 'viewer');
    await screen.findByText(/Connect the tools/);
    expect(screen.queryByText('Ask an admin to connect')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Connect / })).toBeNull();
    expect(screen.getByText('View only. Ask an admin to make changes.')).toBeTruthy();
  });

  it('offers no button for a sign-in this client cannot run yet', async () => {
    const providers = [provider({ slug: 'shopee', name: 'Shopee', short_name: null, auth_type: 'embedded_signup', category: 'marketplace' })];
    catalog(fakeApi({ providers }));
    await screen.findByText('Shopee');
    expect(screen.queryByRole('button', { name: 'Connect Shopee' })).toBeNull();
  });

  it('shows a retryable error when the list cannot load, using the machine code for the words', async () => {
    const api = fakeApi({ listProviders: vi.fn().mockRejectedValue(new ApiError('x', 503, 'dependency_unavailable')) });
    catalog(api);
    expect(await screen.findByText('We could not load this')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.listProviders).toHaveBeenCalledTimes(2));
  });

  it('renders in Indonesian', async () => {
    wrap(
      <ConnectionsCatalog workspaceId="w" workspaceSlug="acme" workspaceName="Acme" role="admin" specialists={specialists} api={fakeApi()} />,
      'id',
    );
    expect(await screen.findByText(/Hubungkan aplikasi yang sudah kamu pakai/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hubungkan Jurnal' })).toBeTruthy();
  });
});

describe('connect flow (consent sheet)', () => {
  it('explains access in plain words before anything is started, then starts with the read tier only', async () => {
    const api = fakeApi();
    const navigate = vi.fn();
    catalog(api, 'admin', { navigate });
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Jurnal' }));
    const sheet = await screen.findByRole('dialog', { name: 'Connect Mekari Jurnal to Acme' });
    expect(api.startOAuth).not.toHaveBeenCalled();
    expect(within(sheet).getByText('Read invoices and contacts')).toBeTruthy();
    expect(within(sheet).getByText('Sineva never sees your password.')).toBeTruthy();
    // Default access: the specialists that use the tool, read only.
    expect(within(sheet).getByText('SinoFinance')).toBeTruthy();
    expect(within(sheet).getAllByText('Sino can read').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('No one can make changes yet.')).toBeTruthy();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Connect Jurnal' }));
    await waitFor(() => expect(api.startOAuth).toHaveBeenCalledTimes(1));
    expect(api.startOAuth).toHaveBeenCalledWith({
      provider: 'mekari_jurnal',
      owner_scope: 'workspace',
      bundle_key: 'read',
      return_to: '/w/acme/tools/result',
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://provider.example/authorize'));
    expect(screen.getByText('Taking you to Mekari Jurnal')).toBeTruthy();
  });

  it('asks for the write tier only when the admin ticks the box', async () => {
    const api = fakeApi();
    catalog(api, 'admin', { navigate: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Jurnal' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).queryByText('Create draft invoices')).toBeNull();
    fireEvent.click(within(sheet).getByRole('checkbox', { name: /let specialists make changes/i }));
    expect(within(sheet).getByText('Create draft invoices')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Connect Jurnal' }));
    await waitFor(() => expect(api.startOAuth).toHaveBeenCalled());
    expect(vi.mocked(api.startOAuth).mock.calls[0]![0].bundle_key).toBe('read_write');
  });

  it('lets a member connect a personal tool, private to them', async () => {
    const api = fakeApi({ providers: catalogFor('member', true) });
    catalog(api, 'member', { navigate: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Jurnal' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('This is your own connection. Only you can see it.')).toBeTruthy();
    expect(within(sheet).queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Connect Jurnal' }));
    await waitFor(() => expect(api.startOAuth).toHaveBeenCalled());
    expect(vi.mocked(api.startOAuth).mock.calls[0]![0].owner_scope).toBe('user');
  });

  it('keeps the sheet open with a plain error when the start fails, and does not leave the app', async () => {
    const navigate = vi.fn();
    const api = fakeApi({ startOAuth: vi.fn().mockRejectedValue(new ApiError('x', 500, 'internal_error')) });
    catalog(api, 'admin', { navigate });
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Jurnal' }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Connect Jurnal' }));
    expect(await within(sheet).findByText(/We could not start the connection/)).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says so when the provider is not configured on this server', async () => {
    const api = fakeApi({
      startOAuth: vi.fn().mockRejectedValue(new ApiError('x', 409, 'conflict', ['provider_not_configured'])),
    });
    catalog(api, 'admin', { navigate: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Jurnal' }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Connect Jurnal' }));
    expect(await within(sheet).findByText('Mekari Jurnal is not available yet. Nothing was changed.')).toBeTruthy();
  });

  it('reconnect shows the sheet again (consent is never skipped), keeps the connection id and the access tier', async () => {
    const api = fakeApi({ connections: [connection({ status: 'needs_reconnect' })] });
    catalog(api, 'admin', { navigate: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect Jurnal' }));
    const sheet = await screen.findByRole('dialog', { name: 'Reconnect Mekari Jurnal' });
    expect(api.reconnect).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Reconnect Jurnal' }));
    await waitFor(() =>
      expect(api.reconnect).toHaveBeenCalledWith(connection().id, { return_to: '/w/acme/tools/result', bundle_key: 'read' }),
    );
  });

  it('a reconnect of a connection that could change things asks for the write tier again', async () => {
    const api = fakeApi({
      connections: [connection({ status: 'needs_reconnect', grants: grants(['sinofinance', 'write']) })],
    });
    catalog(api, 'admin', { navigate: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect Jurnal' }));
    const sheet = await screen.findByRole('dialog', { name: 'Reconnect Mekari Jurnal' });
    expect(within(sheet).getByText('Create draft invoices')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Reconnect Jurnal' }));
    await waitFor(() => expect(api.reconnect).toHaveBeenCalled());
    expect(vi.mocked(api.reconnect).mock.calls[0]![1].bundle_key).toBe('read_write');
  });

  it('opens the sheet straight away for ?connect=slug', async () => {
    catalog(fakeApi(), 'admin', { initialConnect: 'mekari_jurnal' });
    expect(await screen.findByRole('dialog', { name: 'Connect Mekari Jurnal to Acme' })).toBeTruthy();
  });
});

describe('API key form', () => {
  async function open(api: ConnectionsApi) {
    catalog(api, 'admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Xendit' }));
    return screen.findByRole('dialog', { name: 'Connect Xendit' });
  }
  const key = () => screen.getByLabelText('Secret API key') as HTMLInputElement;

  it('says what Sineva will and will not do with the key before it is typed', async () => {
    const dialog = await open(fakeApi());
    expect(within(dialog).getByText(/cannot move money/)).toBeTruthy();
    expect(within(dialog).getByText(/Sineva tests it first/)).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Production' })).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Sandbox' })).toBeTruthy();
    expect(key().type).toBe('password');
  });

  it('asks for the key when it is missing and sends nothing', async () => {
    const api = fakeApi();
    const dialog = await open(api);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test and save' }));
    expect(await within(dialog).findByText('Enter your key to continue.')).toBeTruthy();
    expect(api.saveSecret).not.toHaveBeenCalled();
  });

  it('tests and saves in one step with the chosen environment, closes, and leaves no key anywhere', async () => {
    const api = fakeApi();
    const dialog = await open(api);
    fireEvent.change(key(), { target: { value: 'xnd_secret_abc' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Sandbox' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test and save' }));
    await waitFor(() => expect(api.saveSecret).toHaveBeenCalledTimes(1));
    expect(api.saveSecret).toHaveBeenCalledWith({
      provider: 'xendit',
      secret: { secret_key: 'xnd_secret_abc', environment: 'sandbox' },
      owner_scope: 'workspace',
      connection_id: null,
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Connect Xendit' })).toBeNull());
    expect(document.body.innerHTML).not.toContain('xnd_secret_abc');
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('xnd_secret_abc');
    // The list is refreshed after a save.
    await waitFor(() => expect(api.listConnections).toHaveBeenCalledTimes(2));
  });

  it('says plainly when the key was not accepted, saves nothing and keeps the dialog open for another try', async () => {
    const api = fakeApi({
      saveSecret: vi.fn().mockRejectedValue(new ApiError('x', 422, 'validation_failed', ['connection_test_failed'])),
    });
    const dialog = await open(api);
    fireEvent.change(key(), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test and save' }));
    expect(await within(dialog).findByText('Xendit did not accept this key. Check that you copied all of it.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Connect Xendit' })).toBeTruthy();
    // Typing again clears the message.
    fireEvent.change(key(), { target: { value: 'nope2' } });
    expect(within(dialog).queryByText(/did not accept/)).toBeNull();
  });

  it('says so when the provider could not be reached', async () => {
    const api = fakeApi({
      saveSecret: vi.fn().mockRejectedValue(new ApiError('x', 503, 'dependency_unavailable', ['provider_unreachable'])),
    });
    const dialog = await open(api);
    fireEvent.change(key(), { target: { value: 'xnd' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test and save' }));
    expect(await within(dialog).findByText('We could not reach Xendit. Your key was not saved. Try again.')).toBeTruthy();
  });

  it('asks once before throwing away a typed key', async () => {
    const dialog = await open(fakeApi());
    fireEvent.change(key(), { target: { value: 'xnd_secret_abc' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const confirm = await screen.findByRole('dialog', { name: 'Discard what you typed?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Connect Xendit' })).toBeNull());
  });

  it('reconnecting a key connection replaces its key', async () => {
    const broken = connection({ provider_slug: 'xendit', provider_name: 'Xendit', provider_short_name: null, status: 'needs_reconnect' });
    const api = fakeApi({ connections: [broken] });
    catalog(api, 'admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect Xendit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Replace key for Xendit' });
    fireEvent.change(key(), { target: { value: 'xnd_new' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test and save' }));
    await waitFor(() => expect(api.saveSecret).toHaveBeenCalled());
    expect(vi.mocked(api.saveSecret).mock.calls[0]![0].connection_id).toBe(broken.id);
  });
});

describe('connection detail', () => {
  const base = { workspaceId: 'ws-1', workspaceSlug: 'acme', workspaceName: 'Acme', specialists, navigate: vi.fn() };
  const open = (conn = connection(), api = fakeApi({ connections: [conn] })) => {
    wrap(<ConnectionDetail {...base} connectionId={conn.id} api={api} />);
    return api;
  };

  it('shows the account, when it was connected, health and what Sino can do', async () => {
    open();
    expect(await screen.findByText('Connected as budi@kopisenja.id')).toBeTruthy();
    expect(screen.getByText('Working')).toBeTruthy();
    expect(screen.getByText(/Last checked/)).toBeTruthy();
    expect(screen.getByText('Connected on')).toBeTruthy();
    // The API does not say who connected it, so the row is not invented.
    expect(screen.queryByText('Connected by')).toBeNull();
    expect(screen.getAllByText('Read invoices and contacts').length).toBeGreaterThan(0);
    expect(screen.getByText('Sino can make changes (asks you first)')).toBeTruthy();
  });

  it('keeps raw scope strings behind Technical details', async () => {
    open();
    await screen.findByText('Working');
    expect(screen.queryByText('https://scopes.example/read')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));
    expect(screen.getByText('https://scopes.example/read')).toBeTruthy();
  });

  it('shows when a key should be replaced', async () => {
    open(connection({ secret_rotation_due_at: '2027-01-20T00:00:00Z' }));
    expect(await screen.findByText('Replace the key by')).toBeTruthy();
  });

  it('lets an admin allow changes only after confirming, and saves with Save', async () => {
    const api = open();
    const writeSwitch = await screen.findByRole('switch', { name: 'SinoFinance can make changes in Mekari Jurnal' });
    expect(writeSwitch.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(writeSwitch);
    const confirm = await screen.findByRole('dialog', { name: 'Let SinoFinance make changes in Mekari Jurnal?' });
    expect(within(confirm).getByText(/Create draft invoices/)).toBeTruthy();
    expect(api.updateGrants).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Allow changes' }));
    await waitFor(() => expect(writeSwitch.getAttribute('aria-checked')).toBe('true'));
    expect(api.updateGrants).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save access' }));
    await waitFor(() =>
      expect(api.updateGrants).toHaveBeenCalledWith(connection().id, grants(['sinofinance', 'write'], ['sinoinsights', 'read'])),
    );
    // Saved: nothing left to save.
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save access' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('turning read off removes the specialist and Save sends none', async () => {
    const api = open();
    fireEvent.click(await screen.findByRole('switch', { name: 'SinoInsights can read Mekari Jurnal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save access' }));
    await waitFor(() =>
      expect(api.updateGrants).toHaveBeenCalledWith(connection().id, grants(['sinofinance', 'read'], ['sinoinsights', 'none'])),
    );
  });

  it('a member sees the matrix read only: every switch disabled, no Save, a tooltip reason, no danger zone', async () => {
    open(connection({ can: canFor('member') }));
    const write = await screen.findByRole('switch', { name: 'SinoFinance can make changes in Mekari Jurnal' });
    expect((write as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('switch', { name: 'SinoFinance can read Mekari Jurnal' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save access' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    expect(screen.getByText('View only. Ask an admin to make changes.')).toBeTruthy();
    // Keyboard users reach the reason through the focusable wrapper.
    const wrapper = write.parentElement!;
    expect(wrapper.tabIndex).toBe(0);
    fireEvent.focus(wrapper);
    expect((await screen.findAllByText('Only owners and admins can allow changes.')).length).toBeGreaterThan(0);
  });

  it('a viewer cannot test, reconnect or see activity; an admin can', async () => {
    const api = open(connection({ can: canFor('viewer') }));
    await screen.findByText('Working');
    expect(screen.queryByText('Recent activity')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    expect(api.listActivity).not.toHaveBeenCalled();
    cleanup();
    const adminApi = open();
    expect(await screen.findByText('Recent activity')).toBeTruthy();
    await waitFor(() => expect(adminApi.listActivity).toHaveBeenCalled());
    expect(await screen.findByText('No activity yet')).toBeTruthy();
  });

  it('lists activity in plain words', async () => {
    const api = fakeApi({
      listActivity: vi.fn().mockResolvedValue({
        items: [
          { id: 'a1', occurred_at: '2026-10-21T08:00:00Z', action: 'connection.grant_changed', outcome: null },
          { id: 'a2', occurred_at: '2026-10-20T08:00:00Z', action: 'connection.refresh_failed', outcome: 'failure' },
        ],
        next_cursor: null,
      }),
    });
    open(connection(), api);
    expect(await screen.findByText('Access changed')).toBeTruthy();
    expect(screen.getByText('Could not renew access')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('tests the connection and says the result', async () => {
    const api = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connection works. Checked just now.')).toBeTruthy();
    expect(api.testConnection).toHaveBeenCalledWith(connection().id);
  });

  it('needs reconnecting: banner and one primary Reconnect that opens the consent sheet', async () => {
    open(connection({ status: 'needs_reconnect' }));
    expect(await screen.findByText(/needs to be reconnected/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reconnect Jurnal' })[0]!);
    expect(await screen.findByRole('dialog', { name: 'Reconnect Mekari Jurnal' })).toBeTruthy();
  });

  it('partial: lists what is not allowed yet with an Allow action', async () => {
    open(connection({ status: 'partial', missing_scopes: [writeScope] }));
    expect(await screen.findByText('Create draft invoices')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow missing access' })).toBeTruthy();
  });

  it('disconnect explains what stops working and only then calls the API', async () => {
    const api = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const confirm = await screen.findByRole('dialog', { name: 'Disconnect Mekari Jurnal?' });
    expect(within(confirm).getByText(/Access ends for SinoFinance, SinoInsights/)).toBeTruthy();
    expect(api.disconnect).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Disconnect Jurnal' }));
    await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith(connection().id));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/w/acme/tools'));
  });

  it('a member may disconnect only their own personal connection', async () => {
    open(connection({ owner_scope: 'user', owned_by_me: true, can: canFor('member', true) }));
    expect(await screen.findByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it('replacing a key is offered for key connections only', async () => {
    const keyed = connection({ provider_slug: 'xendit', provider_name: 'Xendit' });
    open(keyed, fakeApi({ connections: [keyed] }));
    expect(await screen.findByRole('button', { name: 'Replace key' })).toBeTruthy();
    cleanup();
    open();
    await screen.findByText('Working');
    expect(screen.queryByRole('button', { name: 'Replace key' })).toBeNull();
  });

  it('shows a calm not found for a connection that is not there', async () => {
    const api = fakeApi({ getConnection: vi.fn().mockRejectedValue(new ApiError('x', 404, 'not_found')) });
    open(connection(), api);
    expect(await screen.findByRole('heading', { name: /not found|isn't here|can't find|page/i })).toBeTruthy();
  });

  it('renders the access matrix with Write absent for providers that cannot change anything', () => {
    wrap(
      <AccessMatrix
        provider={xendit}
        specialists={specialists}
        grants={grants(['sinofinance', 'read'])}
        canGrant
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByRole('switch', { name: /can make changes/ })).toBeNull();
    expect(screen.getByRole('switch', { name: 'SinoFinance can read Xendit' })).toBeTruthy();
  });
});

describe('reconnect banner', () => {
  const broken = connection({ status: 'needs_reconnect' });
  function shell(role: ConnectionsRole, list: ConnectionView[] = [broken], path = '/w/acme') {
    nav.pathname = path;
    return wrap(
      <ConnectionsAttentionProvider workspaceId="ws-1" role={role} api={fakeApi({ connections: list })}>
        <ShellReconnectBanner role={role} workspaceSlug="acme" />
      </ConnectionsAttentionProvider>,
    );
  }

  it('shows for an admin with one action that opens the reconnect step', async () => {
    shell('admin');
    const region = await screen.findByRole('region', { name: 'Connection needs attention' });
    expect(within(region).getByText(/Mekari Jurnal needs to be reconnected/)).toBeTruthy();
    const action = within(region).getByRole('link', { name: 'Reconnect Jurnal' });
    expect(action.getAttribute('href')).toBe(`/w/acme/tools/${broken.id}?reconnect=1`);
  });

  it('can be hidden for today and stays hidden after a reload', async () => {
    const view = shell('owner');
    fireEvent.click(await screen.findByRole('button', { name: 'Hide for today' }));
    expect(screen.queryByRole('region', { name: 'Connection needs attention' })).toBeNull();
    view.unmount();
    shell('owner');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Connection needs attention' })).toBeNull());
  });

  it('counts the others', async () => {
    shell('admin', [broken, connection({ id: 'b', status: 'partial' })]);
    expect(await screen.findByRole('link', { name: 'and 1 more' })).toBeTruthy();
  });

  it('does not show on the Connected tools pages, nor for viewers', async () => {
    shell('admin', [broken], '/w/acme/tools');
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('region')).toBeNull();
    cleanup();
    const api = fakeApi({ connections: [broken] });
    nav.pathname = '/w/acme';
    wrap(
      <ConnectionsAttentionProvider workspaceId="ws-1" role="viewer" api={api}>
        <ShellReconnectBanner role="viewer" workspaceSlug="acme" />
      </ConnectionsAttentionProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(api.listConnections).not.toHaveBeenCalled();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('a member sees nothing for a workspace connection they may not reconnect', async () => {
    const api = fakeApi({ connections: [{ ...broken, can: canFor('member') }] });
    nav.pathname = '/w/acme';
    wrap(
      <ConnectionsAttentionProvider workspaceId="ws-1" role="member" api={api}>
        <ShellReconnectBanner role="member" workspaceSlug="acme" />
      </ConnectionsAttentionProvider>,
    );
    await waitFor(() => expect(api.listConnections).toHaveBeenCalled());
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('specialist Tools drawer', () => {
  it('shows the apps this specialist can use, what it could use, and a way to manage access', async () => {
    const api = fakeApi({
      connections: [
        connection({ grants: grants(['sinofinance', 'write']) }),
        connection({ id: 'c2', provider_slug: 'notion', provider_name: 'Notion', provider_short_name: null, grants: grants(['sinosales', 'read']) }),
      ],
    });
    wrap(<SpecialistToolsButton agentSlug="sinofinance" specialistName="SinoFinance" workspaceId="ws-1" workspaceSlug="acme" api={api} />);
    expect(api.listConnections).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    const drawer = await screen.findByRole('dialog', { name: 'What SinoFinance can use' });
    expect(await within(drawer).findByText('Mekari Jurnal')).toBeTruthy();
    expect(within(drawer).getByText('Sino can make changes (asks you first)')).toBeTruthy();
    expect(within(drawer).queryByText('Notion')).toBeNull();
    // Xendit is used by SinoFinance and not connected yet.
    expect(within(drawer).getByRole('link', { name: 'Connect Xendit' }).getAttribute('href')).toBe('/w/acme/tools?connect=xendit');
    expect(within(drawer).getByRole('link', { name: 'Manage connected tools' }).getAttribute('href')).toBe('/w/acme/tools');
  });

  it('shows the empty preset when the specialist has no tool', async () => {
    wrap(<SpecialistToolsButton agentSlug="sinosocial" specialistName="SinoSocial" workspaceId="ws-1" workspaceSlug="acme" api={fakeApi()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(await screen.findByText('No tools for SinoSocial yet')).toBeTruthy();
  });
});

describe('return page', () => {
  const base = { workspaceId: 'ws-1', workspaceSlug: 'acme', workspaceName: 'Acme', specialists, navigate: vi.fn() };
  const replaceState = vi.spyOn(window.history, 'replaceState');

  it('success: calm confirmation with the account, access and one next step, and the URL is cleaned', async () => {
    const conn = connection({ id: 'c-1' });
    wrap(<ConnectResult {...base} query={{ variant: 'connected', provider: 'mekari_jurnal', connectionId: 'c-1' }} api={fakeApi({ connections: [conn] })} />);
    expect(await screen.findByRole('heading', { name: 'Mekari Jurnal is connected' })).toBeTruthy();
    expect(screen.getByText('Connected as budi@kopisenja.id')).toBeTruthy();
    expect(screen.getByText('Changes are off. You can allow them for each specialist.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review access' }).getAttribute('href')).toBe('/w/acme/tools/c-1');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/w/acme/tools/result');
  });

  it('partial: names what will not work and offers to allow it, through the consent sheet', async () => {
    const conn = connection({ id: 'c-1', status: 'partial', missing_scopes: [writeScope] });
    wrap(<ConnectResult {...base} query={{ variant: 'partial', provider: 'mekari_jurnal', connectionId: 'c-1' }} api={fakeApi({ connections: [conn] })} />);
    expect(await screen.findByText('Some permissions were not given, so some things will not work yet.')).toBeTruthy();
    expect(screen.getByText('Create draft invoices')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Allow missing access' }));
    expect(await screen.findByRole('dialog', { name: 'Reconnect Mekari Jurnal' })).toBeTruthy();
  });

  it.each([
    ['cancelled', 'You cancelled', 'Try again'],
    ['expired', 'That took too long', 'Start again'],
    ['provider_error', 'could not finish', 'Try again'],
    ['different_account', 'This is a different account', 'Connect as new tool'],
    ['duplicate_account', 'Already connected', 'Reconnect this tool'],
  ] as const)('%s: friendly message and a next step', async (variant, heading, action) => {
    wrap(<ConnectResult {...base} query={{ variant, provider: 'mekari_jurnal', connectionId: variant === 'duplicate_account' ? 'c-9' : null }} api={fakeApi()} />);
    expect(await screen.findByRole('heading', { name: new RegExp(heading) })).toBeTruthy();
    expect(screen.getByRole('link', { name: action === 'Reconnect this tool' ? /^Reconnect / : action })).toBeTruthy();
    // Every outcome has a second way out, so nobody is stuck on this page.
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(2);
  });

  it('a duplicate account goes to the existing connection with the reconnect step open', async () => {
    wrap(<ConnectResult {...base} query={{ variant: 'duplicate_account', provider: 'mekari_jurnal', connectionId: 'c-9' }} api={fakeApi()} />);
    const link = await screen.findByRole('link', { name: /^Reconnect / });
    expect(link.getAttribute('href')).toBe('/w/acme/tools/c-9?reconnect=1');
  });

  it('never prints anything it was given as text: the copy is ours', async () => {
    wrap(<ConnectResult {...base} query={{ variant: 'expired', provider: null, connectionId: null }} api={fakeApi()} />);
    expect(await screen.findByText(/took too long, so we stopped it/)).toBeTruthy();
  });
});
