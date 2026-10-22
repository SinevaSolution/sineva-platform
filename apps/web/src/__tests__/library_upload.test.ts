import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadLibraryFile } from '@/client/lib/library_upload';
const api = vi.hoisted(() => vi.fn());
vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const file = () => new File(['hello'], 'hello.txt', { type: 'text/plain' });
const ticket = {
  document_id: 'doc-1',
  upload_url: 'https://storage.example/upload',
  method: 'PUT',
  headers: { 'Content-Type': 'text/plain' },
  max_bytes: 25 * 1024 * 1024,
  expires_in_seconds: 900,
};
describe('Library file upload', () => {
  it('hashes, presigns, uploads with ticket headers, then completes', async () => {
    api.mockResolvedValueOnce(ticket).mockResolvedValueOnce({ id: 'doc-1', status: 'queued' });
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await uploadLibraryFile('ws-1', file())).toEqual({ id: 'doc-1', status: 'queued' });
    expect(api.mock.calls[0]).toEqual([
      '/api/v1/workspaces/ws-1/library/uploads',
      {
        method: 'POST',
        body: expect.objectContaining({
          file_name: 'hello.txt',
          byte_size: 5,
          sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        }),
      },
    ]);
    expect(fetcher).toHaveBeenCalledWith(ticket.upload_url, {
      method: 'PUT',
      headers: ticket.headers,
      body: expect.any(File),
      credentials: 'omit',
    });
    expect(api.mock.calls[1]).toEqual([
      '/api/v1/workspaces/ws-1/library/documents/doc-1/complete',
      { method: 'POST' },
    ]);
  });
  it('does not complete or report success after a storage failure', async () => {
    api.mockResolvedValue(ticket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    await expect(uploadLibraryFile('ws-1', file())).rejects.toMatchObject({
      detailCodes: ['upload_failed'],
    });
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('rejects empty files before any request', async () => {
    await expect(uploadLibraryFile('ws-1', new File([], 'empty.txt'))).rejects.toMatchObject({
      status: 422,
    });
    expect(api).not.toHaveBeenCalled();
  });
});
