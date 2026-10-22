// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LibraryKnowsChip } from '@/client/components/library/library_knows_chip';
import { LibraryScreen, type LibraryFilters } from '@/client/components/library/library_screen';
import type {
  LibraryDocumentListView,
  LibraryDocumentView,
  LibraryFolderView,
  LibraryKnowledgeView,
  LibrarySummaryView,
  LibraryUsageView,
} from '@/shared/library_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
import { SNTooltipProvider } from '@sineva/ui';

const api = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));

vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
vi.mock('@/client/lib/library_upload', () => ({ uploadLibraryFile: upload }));
vi.mock('sonner', () => ({ toast }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

beforeAll(() => {
  // jsdom lacks what Radix pops (popper, select, scroll lock) call.
  const g = globalThis as unknown as Record<string, unknown>;
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  api.mockReset();
  upload.mockReset();
});

const specialist = (agent_slug: string, display_name: string): ShellSpecialistView => ({
  agent_slug,
  display_name,
  role_title: 'Companion',
  short_description: 'Companion',
  accent_key: 'sales',
  room_theme_id: 'sales',
  starter_prompts: ['a', 'b', 'c'],
});
const SPECIALISTS = [specialist('sinosales', 'SinoSales'), specialist('sinosocial', 'SinoSocial'), specialist('sinohelp', 'SinoHelp')];

const FOLDER_A = '00000000-0000-0000-0000-000000000010';
const FOLDER_B = '00000000-0000-0000-0000-000000000011';
const everyone = { scope_type: 'workspace', scope_ref: null } as const;

const folder = (id: string, name: string, parent_id: string | null = null): LibraryFolderView => ({
  id,
  parent_id,
  name,
  scopes: [everyone],
  created_at: '2026-10-22T00:00:00Z',
  updated_at: '2026-10-22T00:00:00Z',
});
const FOLDERS = [folder(FOLDER_A, 'Sales Playbooks'), folder(FOLDER_B, 'Pricing', FOLDER_A)];

const DOC_READY = '00000000-0000-0000-0000-000000000001';
const DOC_LOOK = '00000000-0000-0000-0000-000000000002';

function doc(over: Partial<LibraryDocumentView> = {}): LibraryDocumentView {
  return {
    id: DOC_READY,
    folder_id: null,
    title: 'Company Deck.pdf',
    source_type: 'upload',
    mime_type: 'application/pdf',
    byte_size: 1024 * 1024,
    language: 'en',
    status: 'ready',
    status_detail: null,
    page_count: 12,
    chunk_count: 24,
    embedding_model: 'text-embedding-3-small',
    last_indexed_at: '2026-10-22T00:00:00Z',
    source_updated_at: '2026-10-22T00:00:00Z',
    review_interval_days: null,
    review_due_at: null,
    scopes: [everyone],
    acl_sync_pending: false,
    access_inherited: false,
    created_by: 'user-1',
    created_at: '2026-10-22T03:00:00Z',
    updated_at: '2026-10-22T03:00:00Z',
    ...over,
  };
}

const READY = doc();
const LOOK = doc({
  id: DOC_LOOK,
  folder_id: FOLDER_A,
  title: 'Contract Scan.pdf',
  byte_size: 2048 * 1024,
  status: 'needs_attention',
  status_detail: { reason_code: 'password_protected', pages: [1, 2] },
  page_count: 5,
  scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }],
});
const LIST: LibraryDocumentListView = { items: [READY, LOOK], next_cursor: null };

const SUMMARY: LibrarySummaryView = {
  total: 2,
  by_status: { ready: 1, reading: 0, needs_attention: 1, failed: 0 },
  by_folder: { [FOLDER_A]: 1 },
  in_root: 1,
};
const EMPTY_SUMMARY: LibrarySummaryView = { total: 0, by_status: { ready: 0, reading: 0, needs_attention: 0, failed: 0 }, by_folder: {}, in_root: 0 };
const USAGE: LibraryUsageView = {
  documents: 2,
  storage_bytes: 3 * 1024 * 1024,
  ocr_pages_month: 12,
  storage_limit_bytes: null,
  within_limits: { documents: true, storage: true, ocr_pages: true },
};
const FILTERS: LibraryFilters = { q: '', status: '', usedBy: '', everyoneOnly: false, sort: 'newest' };

type Props = Partial<React.ComponentProps<typeof LibraryScreen>>;

function setup(props: Props = {}, locale: 'en' | 'id' = 'en') {
  return render(
    <SNTooltipProvider>
      <I18nProvider locale={locale} messages={CATALOGS[locale]}>
        <LibraryScreen
          workspaceId="ws-1"
          workspaceSlug="acme"
          list={LIST}
          folders={FOLDERS}
          summary={SUMMARY}
          usage={USAGE}
          uploaderNames={{ 'user-1': 'Sari' }}
          selectedDocument={null}
          canUpload
          canManage
          specialists={SPECIALISTS}
          filters={FILTERS}
          {...props}
        />
      </I18nProvider>
    </SNTooltipProvider>,
  );
}

const openMenu = (trigger: HTMLElement) => fireEvent.keyDown(trigger, { key: 'Enter' });
const dropzoneInput = (label = 'Drop files here, or click to choose') =>
  screen.getByLabelText(label, { selector: 'input' }) as HTMLInputElement;
const openFile = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Open ${name}` }));
  return screen.findByRole('dialog', { name: 'File details' });
};

describe('the friendly header', () => {
  it('says what the Library is for and answers "is Sino ready?" in three numbers', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Teach Sino about your business' })).toBeTruthy();
    expect(screen.getByText('Sino Library')).toBeTruthy();
    const chips = within(screen.getByRole('list', { name: 'Library summary' }));
    expect(chips.getByText('1 ready')).toBeTruthy();
    expect(chips.getByText('0 being read')).toBeTruthy();
    expect(chips.getByText('1 needs a look')).toBeTruthy();
    expect(document.querySelector('img[src*="sino-magnifier"]')).toBeTruthy();
  });

  it('counts files that could not be read with the ones that need a look', () => {
    setup({ summary: { ...SUMMARY, by_status: { ready: 1, reading: 0, needs_attention: 1, failed: 2 } } });
    expect(screen.getByText('3 need a look')).toBeTruthy();
  });

  it('shows storage as text only when there is no limit, and with a slim bar when there is one', () => {
    const { unmount } = setup();
    expect(screen.getByText('3 MB used')).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: 'Storage used' })).toBeNull();
    unmount();
    setup({ usage: { ...USAGE, storage_limit_bytes: 12 * 1024 * 1024 } });
    expect(screen.getByText('3 MB of 12 MB used')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Storage used' });
    expect(bar.getAttribute('aria-valuenow')).toBe(String(3 * 1024 * 1024));
    expect(bar.getAttribute('aria-valuemax')).toBe(String(12 * 1024 * 1024));
  });

  it('hides storage from people who may not see usage', () => {
    setup({ usage: null });
    expect(screen.queryByText(/used$/)).toBeNull();
  });

  it('puts "Soon" next to web links and written notes in the Add menu, disabled', () => {
    setup();
    openMenu(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('menuitem', { name: 'Upload files' })).toBeTruthy();
    for (const name of [/Web link/, /Written note/]) {
      const item = screen.getByRole('menuitem', { name });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(within(item).getByText('Soon')).toBeTruthy();
    }
  });
});

describe('the list', () => {
  it('shows plain statuses, human sizes and who uses each file', () => {
    setup();
    const list = within(screen.getByRole('list', { name: 'Your files' }));
    expect(list.getByText('Company Deck.pdf')).toBeTruthy();
    expect(list.getByText('Ready')).toBeTruthy();
    expect(list.getByText('Needs a look')).toBeTruthy();
    expect(list.getByText('Everyone')).toBeTruthy();
    // The specialist's name is there for screen readers even though the face is a picture.
    expect(list.getByText('SinoSales')).toBeTruthy();
    expect(list.getByText('Some pages could not be read.')).toBeTruthy();
    expect(list.getByText('Sales Playbooks')).toBeTruthy();
  });

  it('never prints a raw byte count or an engineering word, in either language', () => {
    const banned = /\b(OCR|embedding|chunk|vector|index|indexing|ingest|token|payload|webhook|json|bff|queued|processing|bytes)\b|1048576/i;
    const { unmount } = setup({ list: { items: [READY, LOOK, doc({ id: 'x', title: 'Reading.pdf', status: 'queued' })], next_cursor: null } });
    expect(document.body.textContent ?? '').not.toMatch(banned);
    unmount();
    setup({ list: LIST }, 'id');
    expect(document.body.textContent ?? '').not.toMatch(banned);
  });

  it('reads "Reading" for queued and processing files, with progress when known', () => {
    setup({
      list: {
        items: [
          doc({ id: 'a', title: 'Waiting.pdf', status: 'queued' }),
          doc({ id: 'b', title: 'Handbook.pdf', status: 'processing', status_detail: { progress: { current: 12, total: 40 } } }),
        ],
        next_cursor: null,
      },
    });
    // Two pills in the list; the third "Reading" on the page is the filter chip.
    expect(within(screen.getByRole('list', { name: 'Your files' })).getAllByText('Reading')).toHaveLength(2);
    const bar = screen.getByRole('progressbar', { name: 'Reading page 12 of 40' });
    expect(bar.getAttribute('aria-valuenow')).toBe('12');
    expect(bar.getAttribute('aria-valuemax')).toBe('40');
  });

  it('switches to cards and remembers the choice in this browser', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
    expect(screen.getByRole('list', { name: 'Your files' }).className).toContain('grid');
    expect(window.localStorage.getItem('sineva.library.view')).toBe('cards');
    expect(screen.getByRole('radio', { name: 'Cards' }).getAttribute('aria-checked')).toBe('true');
  });

  it('shows more files by asking for the next page and appending it', async () => {
    api.mockResolvedValueOnce({ items: [doc({ id: 'more', title: 'Second page.pdf' })], next_cursor: null });
    setup({ list: { ...LIST, next_cursor: 'cursor-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Second page.pdf')).toBeTruthy();
    expect(api.mock.calls[0]![0]).toContain('/api/v1/workspaces/ws-1/library/documents?');
    expect(api.mock.calls[0]![0]).toContain('cursor=cursor-1');
    expect(screen.getByText('Company Deck.pdf')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('asks again while a file is being read, and stops when nothing is left', () => {
    vi.useFakeTimers();
    const reading = { ...SUMMARY, by_status: { ...SUMMARY.by_status, reading: 1 } };
    const { unmount } = setup({ summary: reading });
    act(() => {
      vi.advanceTimersByTime(5200);
    });
    expect(router.refresh).toHaveBeenCalled();
    unmount();
    router.refresh.mockClear();
    setup({ summary: SUMMARY });
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('filters and search live in the URL', () => {
  it('a status chip changes the URL and the clear chip removes it', () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(router.replace).toHaveBeenLastCalledWith('/w/acme/library?status=ready', { scroll: false });
    unmount();
    setup({ filters: { ...FILTERS, status: 'ready' } });
    expect(screen.getByRole('button', { name: 'Ready' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(router.replace).toHaveBeenLastCalledWith('/w/acme/library', { scroll: false });
  });

  it('keeps the collection while filtering, and searches on Enter', () => {
    setup({ filters: { ...FILTERS, folderId: FOLDER_A } });
    const box = screen.getByRole('searchbox', { name: 'Search your files' });
    fireEvent.change(box, { target: { value: 'harga' } });
    fireEvent.submit(box.closest('form')!);
    expect(router.replace).toHaveBeenLastCalledWith(`/w/acme/library?folder_id=${FOLDER_A}&q=harga`, { scroll: false });
  });

  it('searches after a pause in typing, not on every key', () => {
    vi.useFakeTimers();
    setup();
    const box = screen.getByRole('searchbox', { name: 'Search your files' });
    fireEvent.change(box, { target: { value: 'ha' } });
    fireEvent.change(box, { target: { value: 'harga' } });
    expect(router.replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/w/acme/library?q=harga', { scroll: false });
  });

  it('offers a way to clear the search from the box', () => {
    setup({ filters: { ...FILTERS, q: 'harga' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(router.replace).toHaveBeenCalledWith('/w/acme/library', { scroll: false });
  });
});

describe('empty states', () => {
  it('an empty Library shows Sino and an upload action', () => {
    setup({ list: { items: [], next_cursor: null }, summary: EMPTY_SUMMARY });
    expect(screen.getByRole('heading', { name: 'Your Library is empty' })).toBeTruthy();
    expect(document.querySelector('img[src*="sino-wave"]')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Upload files' }).length).toBeGreaterThan(0);
  });

  it('an empty collection shows an icon, not Sino', () => {
    setup({ list: { items: [], next_cursor: null }, filters: { ...FILTERS, folderId: FOLDER_A } });
    const state = screen.getByRole('heading', { name: 'This collection is empty' }).closest('[role="status"]')!;
    expect(state.querySelector('[data-slot="empty-icon"]')).toBeTruthy();
    expect(state.querySelector('img')).toBeNull();
  });

  it('a search with no hits names the search and can clear it', () => {
    setup({ list: { items: [], next_cursor: null }, filters: { ...FILTERS, q: 'zzz' } });
    const state = screen.getByRole('heading', { name: 'No files match “zzz”' }).closest('[role="status"]') as HTMLElement;
    fireEvent.click(within(state).getByRole('button', { name: 'Clear search' }));
    expect(router.replace).toHaveBeenCalledWith('/w/acme/library', { scroll: false });
  });

  it('filters that match nothing can be cleared', () => {
    setup({ list: { items: [], next_cursor: null }, filters: { ...FILTERS, status: 'failed' } });
    expect(screen.getByRole('heading', { name: 'Nothing matches these filters' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.replace).toHaveBeenCalledWith('/w/acme/library', { scroll: false });
  });

  it('does not offer to upload to someone who cannot', () => {
    setup({ list: { items: [], next_cursor: null }, summary: EMPTY_SUMMARY, canUpload: false, canManage: false });
    expect(screen.getByText('Nobody has added files yet. Ask an owner or admin to add some.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upload files' })).toBeNull();
  });
});

describe('adding files', () => {
  const files = (...names: string[]) => names.map((name) => new File(['hello'], name, { type: 'text/plain' }));

  it('starts by itself, keeps going after a failure, and retries only the failed file', async () => {
    upload
      .mockResolvedValueOnce({ id: 'first' })
      .mockRejectedValueOnce(new Error('private storage details'))
      .mockResolvedValueOnce({ id: 'third' });
    setup();
    fireEvent.change(dropzoneInput(), { target: { files: files('first.txt', 'second.txt', 'third.txt') } });

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    const cards = within(await screen.findByRole('list', { name: 'Files being added' }));
    await waitFor(() => expect(cards.getAllByText('Sent. Sino is reading it.')).toHaveLength(2));
    expect(cards.getByText("Couldn't upload")).toBeTruthy();
    // The reason is in plain words, never what the server said.
    expect(screen.queryByText('private storage details')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong. Try again.');
    expect(upload.mock.calls.map((args) => args[1].name)).toEqual(['first.txt', 'second.txt', 'third.txt']);
    // No scopes are sent: a new file follows its collection.
    expect(upload.mock.calls[0]![2]).toEqual({ folder_id: null });
    expect(router.refresh).toHaveBeenCalledTimes(1);

    upload.mockResolvedValueOnce({ id: 'second' });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(4));
    expect(upload.mock.calls[3]![1].name).toBe('second.txt');
  });

  it('shows per-file progress while a file travels and removes the finished card after a moment', async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    upload.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    setup();
    fireEvent.change(dropzoneInput(), { target: { files: files('handbook.txt') } });
    expect(screen.getByRole('progressbar', { name: 'Uploading handbook.txt' })).toBeTruthy();
    expect(screen.getByText('Uploading')).toBeTruthy();
    await act(async () => {
      finish({ id: 'h' });
    });
    expect(screen.getByText('Sent. Sino is reading it.')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5200);
    });
    expect(screen.queryByText('handbook.txt')).toBeNull();
  });

  it('sends a file to the collection being viewed, and says so', async () => {
    upload.mockResolvedValue({ id: 'x' });
    setup({ filters: { ...FILTERS, folderId: FOLDER_A } });
    expect(screen.getByText(/Adding to Sales Playbooks\./)).toBeTruthy();
    fireEvent.change(dropzoneInput(), { target: { files: files('sop.txt') } });
    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(upload.mock.calls[0]![2]).toEqual({ folder_id: FOLDER_A });
  });

  it('refuses a file type or size it cannot take, in plain words', () => {
    setup();
    fireEvent.change(dropzoneInput(), { target: { files: [new File(['x'], 'virus.exe', { type: 'application/x-msdownload' })] } });
    expect(screen.getByText('Choose a PDF, Word, Excel, CSV, slides, text or image file.')).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows no zone and no Add menu to a viewer', () => {
    setup({ canUpload: false, canManage: false });
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByLabelText('Drop files here, or click to choose', { selector: 'input' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New collection' })).toBeNull();
  });
});

describe('collections', () => {
  it('nests collections with counts, and opens a collection through the URL', () => {
    setup({ filters: { ...FILTERS, folderId: FOLDER_B } });
    const nav = within(screen.getByRole('navigation', { name: 'Collections' }));
    expect(nav.getByRole('link', { name: /All files/ }).textContent).toContain('2');
    expect(nav.getByRole('link', { name: /Not in a collection/ }).textContent).toContain('1');
    const parent = nav.getByRole('link', { name: /Sales Playbooks/ });
    expect(parent.getAttribute('href')).toBe(`/w/acme/library?folder_id=${FOLDER_A}`);
    // The selected child is open, so the tree opens down to it.
    expect(nav.getByRole('link', { name: /Pricing/ }).getAttribute('aria-current')).toBe('page');
  });

  it('collapses and expands a collection with children', () => {
    setup();
    const nav = within(screen.getByRole('navigation', { name: 'Collections' }));
    expect(nav.queryByRole('link', { name: /Pricing/ })).toBeNull();
    fireEvent.click(nav.getByRole('button', { name: 'Expand Sales Playbooks' }));
    expect(nav.getByRole('link', { name: /Pricing/ })).toBeTruthy();
    fireEvent.click(nav.getByRole('button', { name: 'Collapse Sales Playbooks' }));
    expect(nav.queryByRole('link', { name: /Pricing/ })).toBeNull();
  });

  it('creates a collection with who can use it', async () => {
    api.mockResolvedValue({});
    setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'New collection' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'New collection' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'FAQ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create collection' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/library/folders', {
        method: 'POST',
        body: { name: 'FAQ', parent_id: null, scopes: [{ scope_type: 'workspace' }] },
      }),
    );
  });

  it('changes a collection access to chosen specialists and sends only what changed', async () => {
    api.mockResolvedValue({});
    setup();
    openMenu(screen.getByRole('button', { name: 'Options for Sales Playbooks' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Collection settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Collection settings' });
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Everyone' }));
    // Nothing chosen yet: saving is blocked and the reason is shown.
    expect(within(dialog).getByRole('alert').textContent).toBe('Pick at least one specialist, or turn on Everyone.');
    expect(within(dialog).getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'SinoSales' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/folders/${FOLDER_A}`, {
        method: 'PATCH',
        body: { scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }] },
      }),
    );
  });

  it('lists Squads and Workflows as disabled "Soon" options in the picker', async () => {
    setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'New collection' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'New collection' });
    for (const name of [/^Squads/, /^Workflows/]) {
      const chip = within(dialog).getByRole('button', { name });
      expect(chip.hasAttribute('disabled')).toBe(true);
      expect(within(chip).getByText('Soon')).toBeTruthy();
    }
  });

  it('deletes an empty collection after a confirmation that explains the rule', async () => {
    api.mockResolvedValue({});
    setup();
    openMenu(screen.getByRole('button', { name: 'Options for Sales Playbooks' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete collection' }));
    expect(await screen.findByText(/can't be deleted: move or delete them first/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/folders/${FOLDER_A}`, { method: 'DELETE' }),
    );
  });

  it('does not offer collection actions to someone who cannot manage', () => {
    setup({ canManage: false });
    expect(screen.queryByRole('button', { name: 'Options for Sales Playbooks' })).toBeNull();
  });
});

describe('the file drawer', () => {
  it('shows the file, where it lives, who uploaded it and when, in human units', async () => {
    setup();
    const dialog = within(await openFile('Company Deck.pdf'));
    expect(dialog.getByRole('heading', { name: 'Company Deck.pdf' })).toBeTruthy();
    expect(dialog.getByText(/PDF document · 1 MB · 12 pages/)).toBeTruthy();
    expect(dialog.getByText('Sari, Oct 22, 2026, 10:00 AM')).toBeTruthy();
    expect(dialog.getByText('Sino can use this file.')).toBeTruthy();
    expect(router.replace).toHaveBeenCalledWith(`/w/acme/library?doc=${DOC_READY}`, { scroll: false });
  });

  it('opens from the URL for a file that is not on the loaded page', async () => {
    setup({ selectedDocument: doc({ id: 'deep', title: 'Deep link.pdf' }) });
    expect(await screen.findByRole('dialog', { name: 'File details' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Deep link.pdf' })).toBeTruthy();
  });

  it('opens a new chat about the file, prefilled, with the specialist when only one can use it', async () => {
    setup();
    const everyoneDialog = within(await openFile('Company Deck.pdf'));
    const link = everyoneDialog.getByRole('link', { name: 'Try asking Sino about this file' });
    const url = new URL(link.getAttribute('href')!, 'https://app.sineva.id');
    expect(url.pathname).toBe('/w/acme/new');
    expect(url.searchParams.get('prompt')).toBe('What is in “Company Deck.pdf”?');
    expect(url.searchParams.get('with')).toBeNull();
  });

  it('points a specialist-only file at that specialist', async () => {
    setup({ list: { items: [READY, { ...LOOK, status: 'ready', status_detail: null }], next_cursor: null } });
    const dialog = within(await openFile('Contract Scan.pdf'));
    const url = new URL(dialog.getByRole('link', { name: 'Try asking Sino about this file' }).getAttribute('href')!, 'https://app.sineva.id');
    expect(url.searchParams.get('with')).toBe('sinosales');
  });

  it('explains a file that needs a look and offers Replace and Try again', async () => {
    api.mockResolvedValue({});
    setup();
    const dialog = within(await openFile('Contract Scan.pdf'));
    expect(dialog.getByText('This PDF is password protected. Remove the password and upload it again.')).toBeTruthy();
    expect(dialog.getByText('Pages to check: 1, 2')).toBeTruthy();
    expect(dialog.queryByRole('link', { name: 'Try asking Sino about this file' })).toBeNull();
    fireEvent.click(dialog.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/documents/${DOC_LOOK}/reindex`, { method: 'POST' }),
    );
    expect(dialog.getByRole('button', { name: 'Replace file' })).toBeTruthy();
  });

  it('shows what Sino read', async () => {
    api.mockResolvedValueOnce({
      document_id: DOC_READY,
      status: 'ready',
      page_count: 1,
      pages: [{ page: 1, text: 'Extracted text from page 1', ocr: false, readable: true }],
      next_page: null,
    });
    setup();
    fireEvent.click(within(await openFile('Company Deck.pdf')).getByRole('button', { name: 'See what Sino read' }));
    expect(await screen.findByText('Extracted text from page 1')).toBeTruthy();
    expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/documents/${DOC_READY}/preview`);
  });

  it('renames a file', async () => {
    api.mockResolvedValue({});
    setup();
    const dialog = within(await openFile('Company Deck.pdf'));
    expect(dialog.queryByRole('button', { name: 'Save name' })).toBeNull();
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Deck 2026.pdf' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save name' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/documents/${DOC_READY}`, {
        method: 'PATCH',
        body: { title: 'Deck 2026.pdf' },
      }),
    );
  });

  it('gives a file its own access, and can put it back on its collection', async () => {
    api.mockResolvedValue({});
    setup({ list: { items: [doc({ access_inherited: true, folder_id: FOLDER_A })], next_cursor: null } });
    const dialog = within(await openFile('Company Deck.pdf'));
    // Following the collection: the picker is locked and says what it follows.
    expect(dialog.getByText(/Follows Sales Playbooks, which is open to everyone/)).toBeTruthy();
    expect(dialog.getByRole('switch', { name: 'Everyone' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(dialog.getByRole('switch', { name: 'Same as the collection' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/documents/${DOC_READY}`, {
        method: 'PATCH',
        body: { scopes: [{ scope_type: 'workspace' }] },
      }),
    );
  });

  it('saves a chosen set of specialists for a file with its own access', async () => {
    api.mockResolvedValue({});
    setup();
    const dialog = within(await openFile('Company Deck.pdf'));
    fireEvent.click(dialog.getByRole('switch', { name: 'Everyone' }));
    fireEvent.click(dialog.getByRole('button', { name: 'SinoSocial' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Save who can use this' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/documents/${DOC_READY}`, {
        method: 'PATCH',
        body: { scopes: [{ scope_type: 'specialist', scope_ref: 'sinosocial' }] },
      }),
    );
  });

  it('moves a file to another collection', async () => {
    api.mockResolvedValue({});
    setup();
    const dialog = within(await openFile('Company Deck.pdf'));
    fireEvent.keyDown(dialog.getByRole('combobox', { name: 'Collection' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Sales Playbooks' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/documents/${DOC_READY}`, {
        method: 'PATCH',
        body: { folder_id: FOLDER_A },
      }),
    );
  });

  it('deletes after a confirmation that says what happens to old chats', async () => {
    api.mockResolvedValue({});
    setup();
    fireEvent.click(within(await openFile('Company Deck.pdf')).getByRole('button', { name: 'Delete file' }));
    expect(await screen.findByText(/Chats that used it will show “Source deleted”/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/documents/${DOC_READY}`, { method: 'DELETE' }),
    );
  });

  it('replaces a file: the new one keeps the collection and access, then the old one goes', async () => {
    api.mockResolvedValue({});
    upload.mockResolvedValue({ id: 'new' });
    setup();
    fireEvent.click(within(await openFile('Contract Scan.pdf')).getByRole('button', { name: 'Replace file' }));
    const replace = await screen.findByRole('dialog', { name: 'Replace file' });
    const input = within(replace).getByLabelText('Drop the new file here, or click to choose', { selector: 'input' });
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'contract-clear.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0]![1].name).toBe('contract-clear.pdf');
    expect(upload.mock.calls[0]![2]).toEqual({
      folder_id: FOLDER_A,
      scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }],
    });
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/workspaces/ws-1/library/documents/${DOC_LOOK}`, { method: 'DELETE' }),
    );
    // The old file goes only after the new one was received.
    expect(upload.mock.invocationCallOrder[0]!).toBeLessThan(api.mock.invocationCallOrder[0]!);
  });

  it('keeps the old file and says so when the upload of the new one fails', async () => {
    upload.mockRejectedValue(new Error('storage down'));
    setup();
    fireEvent.click(within(await openFile('Contract Scan.pdf')).getByRole('button', { name: 'Replace file' }));
    const replace = await screen.findByRole('dialog', { name: 'Replace file' });
    fireEvent.change(within(replace).getByLabelText('Drop the new file here, or click to choose', { selector: 'input' }), {
      target: { files: [new File(['%PDF'], 'again.pdf', { type: 'application/pdf' })] },
    });
    expect(await within(replace).findByRole('alert')).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  it('shows a viewer the facts and no controls', async () => {
    setup({ canUpload: false, canManage: false });
    const dialog = within(await openFile('Contract Scan.pdf'));
    expect(dialog.getByText('SinoSales')).toBeTruthy();
    for (const name of ['Delete file', 'Replace file', 'Try again', 'Save name']) {
      expect(dialog.queryByRole('button', { name })).toBeNull();
    }
    expect(dialog.queryByRole('switch')).toBeNull();
  });

  it('flags a document whose access change has not reached Sino yet', async () => {
    setup({ list: { items: [doc({ acl_sync_pending: true })], next_cursor: null } });
    expect(within(await openFile('Company Deck.pdf')).getByText('Updating who can use this.')).toBeTruthy();
  });
});

describe('storage details', () => {
  it('opens the limits in plain words', async () => {
    setup({ usage: { ...USAGE, within_limits: { documents: true, storage: true, ocr_pages: false } } });
    fireEvent.click(screen.getByRole('button', { name: 'Storage details' }));
    const drawer = within(await screen.findByRole('dialog', { name: 'Storage and limits' }));
    expect(drawer.getByText('3 MB')).toBeTruthy();
    expect(drawer.getByText("You've reached this month's limit for pages read from photos and scans.")).toBeTruthy();
  });
});

describe('Knows N documents', () => {
  const knowledge: LibraryKnowledgeView = { everyone: 3, specialists: { sinosales: 5, sinohelp: 0 } };
  const chip = (agentSlug: string | null, name = 'SinoSales') =>
    render(
      <SNTooltipProvider>
        <I18nProvider locale="en" messages={CATALOGS.en}>
          <LibraryKnowsChip workspaceSlug="acme" knowledge={knowledge} agentSlug={agentSlug} name={name} />
        </I18nProvider>
      </SNTooltipProvider>,
    );

  it('links a specialist to the Library filtered by what it can use', () => {
    chip('sinosales');
    const link = screen.getByRole('link', { name: 'Knows 5 documents' });
    expect(link.getAttribute('href')).toBe('/w/acme/library?used_by=sinosales');
  });

  it('links Sino in team chats to the files marked Everyone', () => {
    chip(null, 'Sino');
    expect(screen.getByRole('link', { name: 'Knows 3 documents' }).getAttribute('href')).toBe('/w/acme/library?scope_type=workspace');
  });

  it('says so plainly when nothing is known yet, and shows nothing for a specialist the member may not use', () => {
    const { unmount } = chip('sinohelp', 'SinoHelp');
    expect(screen.getByRole('link', { name: 'Knows no documents yet' })).toBeTruthy();
    unmount();
    chip('sinofinance', 'SinoFinance');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
