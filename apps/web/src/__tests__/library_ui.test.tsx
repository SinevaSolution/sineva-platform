// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LibraryScreen } from '@/client/components/library/library_screen';
import type {
  LibraryDocumentListView,
  LibraryFolderView,
  LibraryUsageView,
} from '@/shared/library_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
import { SNTooltipProvider } from '@sineva/ui';

const api = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));

vi.mock('@/client/lib/library_upload', () => ({
  uploadLibraryFile: upload,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  upload.mockReset();
});

const sampleSpecialists: ShellSpecialistView[] = [
  {
    agent_slug: 'sinosales',
    display_name: 'SinoSales',
    role_title: 'Sales companion',
    short_description: 'Sales companion',
    accent_key: 'sales',
    room_theme_id: 'sales',
    starter_prompts: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
  },
  {
    agent_slug: 'sinosocial',
    display_name: 'SinoSocial',
    role_title: 'Social companion',
    short_description: 'Social companion',
    accent_key: 'social',
    room_theme_id: 'social',
    starter_prompts: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
  },
];

const sampleFolders: LibraryFolderView[] = [
  {
    id: '00000000-0000-0000-0000-000000000010',
    parent_id: null,
    name: 'Sales Playbooks',
    created_at: '2026-10-22T00:00:00Z',
    updated_at: '2026-10-22T00:00:00Z',
  },
];

const sampleList: LibraryDocumentListView = {
  items: [
    {
      id: '00000000-0000-0000-0000-000000000001',
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
      review_interval_days: 90,
      review_due_at: '2027-01-20T00:00:00Z',
      scopes: [{ scope_type: 'workspace', scope_ref: null }],
      acl_sync_pending: false,
      created_by: 'user-1',
      created_at: '2026-10-22T00:00:00Z',
      updated_at: '2026-10-22T00:00:00Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      folder_id: '00000000-0000-0000-0000-000000000010',
      title: 'Contract Scan.pdf',
      source_type: 'upload',
      mime_type: 'application/pdf',
      byte_size: 2048 * 1024,
      language: 'id',
      status: 'needs_attention',
      status_detail: {
        reason_code: 'password_protected',
        pages: [1, 2],
      },
      page_count: 5,
      chunk_count: 0,
      embedding_model: null,
      last_indexed_at: null,
      source_updated_at: '2026-10-22T00:00:00Z',
      review_interval_days: null,
      review_due_at: null,
      scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }],
      acl_sync_pending: false,
      created_by: 'user-1',
      created_at: '2026-10-22T00:00:00Z',
      updated_at: '2026-10-22T00:00:00Z',
    },
  ],
  next_cursor: null,
};

const sampleUsage: LibraryUsageView = {
  documents: 2,
  storage_bytes: 3 * 1024 * 1024,
  ocr_pages_month: 12,
  within_limits: {
    documents: true,
    storage: true,
    ocr_pages: true,
  },
};

function setup({
  list = sampleList,
  folders = sampleFolders,
  usage = sampleUsage,
  canUpload = true,
  canManage = true,
  specialists = sampleSpecialists,
  folderId = undefined as string | undefined,
  search = '',
  status = '',
} = {}) {
  return render(
    <SNTooltipProvider>
      <I18nProvider locale="en" messages={CATALOGS.en}>
        <LibraryScreen
          workspaceId="ws-1"
          workspaceSlug="acme"
          list={list}
          folders={folders}
          usage={usage}
          canUpload={canUpload}
          canManage={canManage}
          specialists={specialists}
          folderId={folderId}
          search={search}
          status={status}
        />
      </I18nProvider>
    </SNTooltipProvider>,
  );
}

describe('LibraryScreen', () => {
  it('renders document titles and statuses', () => {
    setup();
    expect(screen.getByText('Company Deck.pdf')).toBeTruthy();
    expect(screen.getByText('Contract Scan.pdf')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview extracted text' })).toBeTruthy();
  });

  it('renders empty state when list has no items', () => {
    setup({ list: { items: [], next_cursor: null } });
    expect(
      screen.getByText('No documents match this view. Upload a file or add a note to get started.'),
    ).toBeTruthy();
  });

  it('restricts viewer actions when canUpload and canManage are false', () => {
    setup({ canUpload: false, canManage: false });
    expect(screen.queryByRole('button', { name: 'Upload file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New folder' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit document' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Check what Sino can find' })).toBeNull();
  });

  it('opens and closes the upload dialog with dropzone', async () => {
    upload.mockResolvedValue({ id: 'doc-new', status: 'queued' });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Upload file' }));
    expect(screen.getByRole('heading', { name: 'Upload file' })).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('opens document preview and displays pages', async () => {
    api.mockResolvedValueOnce({
      document_id: '00000000-0000-0000-0000-000000000001',
      pages: [{ page: 1, text: 'Extracted text from page 1' }],
      next_page: null,
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Preview extracted text' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-1/library/documents/00000000-0000-0000-0000-000000000001/preview',
      ),
    );
    expect(await screen.findByText('Extracted text from page 1')).toBeTruthy();
  });

  it('submits a try question and displays search results', async () => {
    api.mockResolvedValueOnce({
      results: [
        {
          document_id: '00000000-0000-0000-0000-000000000001',
          title: 'Company Deck.pdf',
          chunk_id: 'chunk-1',
          snippet: 'Relevant passage about pricing',
          page_number: 3,
        },
      ],
      abstained: false,
    });
    setup();
    const questionInput = screen.getByRole('textbox', {
      name: 'Question about your documents',
    });
    fireEvent.change(questionInput, { target: { value: 'What is our pricing?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Library' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/library/try', {
        method: 'POST',
        body: { query: 'What is our pricing?' },
      }),
    );
    expect(await screen.findByText('Relevant passage about pricing')).toBeTruthy();
  });

  it('displays detailed reason codes and flagged page numbers', () => {
    setup();
    expect(
      screen.getByText('This PDF is password protected. Remove the password and upload again.'),
    ).toBeTruthy();
    expect(screen.getByText('Pages needing attention: 1, 2')).toBeTruthy();
  });

  it('displays reading progress and progress bar for processing documents', () => {
    const processingDoc = {
      ...sampleList.items[0],
      id: '00000000-0000-0000-0000-000000000003',
      title: 'Large Handbook.pdf',
      status: 'processing' as const,
      status_detail: {
        progress: { current: 12, total: 40 },
      },
    };
    setup({
      list: {
        items: [processingDoc],
        next_cursor: null,
      },
    });
    expect(screen.getByText('Reading page 12 of 40')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Reading page 12 of 40' });
    expect(bar.getAttribute('aria-valuenow')).toBe('12');
    expect(bar.getAttribute('aria-valuemax')).toBe('40');
  });

  it('opens usage and quota drawer on button click', async () => {
    setup({
      usage: {
        documents: 5,
        storage_bytes: 10 * 1024 * 1024,
        ocr_pages_month: 20,
        within_limits: {
          documents: true,
          storage: true,
          ocr_pages: false,
        },
      },
    });
    const quotaButton = screen.getByRole('button', { name: 'Usage & limits' });
    fireEvent.click(quotaButton);
    expect(await screen.findByRole('dialog', { name: 'Storage & limits' })).toBeTruthy();
    expect(screen.getByText('OCR monthly limit reached')).toBeTruthy();
  });

  it('renders scope, source type, and language filter controls and updates URL', () => {
    setup();
    const sourceSelect = screen.getByLabelText('Source type');
    expect(sourceSelect).toBeTruthy();
    const languageSelect = screen.getByLabelText('Language');
    expect(languageSelect).toBeTruthy();
    const scopeFilterSelect = screen.getByLabelText('Scope filter');
    expect(scopeFilterSelect).toBeTruthy();
  });

  it('allows renaming and moving a folder', async () => {
    api.mockResolvedValue({});
    setup({ folderId: '00000000-0000-0000-0000-000000000010' });
    const renameButton = screen.getByRole('button', { name: 'Rename' });
    fireEvent.click(renameButton);
    const renameInput = screen.getByLabelText('Folder name');
    fireEvent.change(renameInput, { target: { value: 'Updated Playbooks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-1/library/folders/00000000-0000-0000-0000-000000000010',
        {
          method: 'PATCH',
          body: { name: 'Updated Playbooks' },
        },
      ),
    );
  });
});

it('FR-LIB-01 uploads remaining files after a failure and retries only the failed row', async () => {
  upload
    .mockResolvedValueOnce({ id: 'first', status: 'queued' })
    .mockRejectedValueOnce(new Error('private storage details'))
    .mockResolvedValueOnce({ id: 'third', status: 'queued' });
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Upload file' }));
  const files = ['first.txt', 'second.txt', 'third.txt'].map(
    (name) => new File(['hello'], name, { type: 'text/plain' }),
  );
  const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(picker, { target: { files } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
  expect(screen.getAllByText('Uploaded; waiting to be read')).toHaveLength(2);
  expect(screen.queryByText('private storage details')).toBeNull();
  expect(router.refresh).toHaveBeenCalled();
  upload.mockResolvedValueOnce({ id: 'second', status: 'queued' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed uploads' }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(4));
  expect(upload.mock.calls.map((args) => args[1].name)).toEqual([
    'first.txt',
    'second.txt',
    'third.txt',
    'second.txt',
  ]);
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Upload file' })).toBeNull());
});

it('FR-LIB-01 shows per-file progress and prevents closing or changing scope during upload', async () => {
  let finish!: (value: unknown) => void;
  upload.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Upload file' }));
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [new File(['hello'], 'handbook.txt', { type: 'text/plain' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('progressbar', { name: 'Uploading handbook.txt' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
  finish({ id: 'handbook', status: 'queued' });
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
});
