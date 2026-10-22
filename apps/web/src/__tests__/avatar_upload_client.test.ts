import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiErrorKey } from '@/client/lib/api';
import { avatarFileProblem, uploadAvatar } from '@/client/lib/avatar_upload';
import { AVATAR_MAX_BYTES } from '@/shared/avatar_limits';

function file(type: string, size: number, name = 'me.png'): File {
  return new File([new Uint8Array(size)], name, { type });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('avatarFileProblem', () => {
  it('accepts jpeg, png and webp up to 2 MB', () => {
    expect(avatarFileProblem(file('image/jpeg', 10))).toBeNull();
    expect(avatarFileProblem(file('image/png', 10))).toBeNull();
    expect(avatarFileProblem(file('image/webp', AVATAR_MAX_BYTES))).toBeNull();
  });

  it('refuses svg, gif and unknown types by the declared type', () => {
    expect(avatarFileProblem(file('image/svg+xml', 10))).toBe('unsupported_image');
    expect(avatarFileProblem(file('image/gif', 10))).toBe('unsupported_image');
    expect(avatarFileProblem(file('', 10, 'x.png'))).toBe('unsupported_image');
  });

  it('refuses an empty file and one over 2 MB', () => {
    expect(avatarFileProblem(file('image/png', 0))).toBe('unsupported_image');
    expect(avatarFileProblem(file('image/png', AVATAR_MAX_BYTES + 1))).toBe('image_too_large');
  });
});

describe('uploadAvatar', () => {
  const ticket = {
    upload_id: '44444444-4444-4444-8444-444444444444',
    upload_url: 'https://s3.test/bucket/avatars/pending/x',
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    expires_in_seconds: 300,
    max_bytes: AVATAR_MAX_BYTES,
  };
  const envelope = (data: unknown, status = 200) =>
    new Response(JSON.stringify({ success: true, status, data }), { status });

  it('requests a ticket, PUTs the file with the ticket headers, then completes', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown; headers?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body, headers: init?.headers });
        if (url === '/api/v1/me/avatar') return envelope(ticket, 201);
        if (url === ticket.upload_url) return new Response(null, { status: 200 });
        return envelope({ id: 'usr-1', avatar_url: '/api/v1/me/avatar?v=1' });
      }),
    );

    const picture = file('image/png', 100);
    const profile = await uploadAvatar(picture);

    expect(profile.avatar_url).toBe('/api/v1/me/avatar?v=1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/v1/me/avatar',
      `PUT ${ticket.upload_url}`,
      'POST /api/v1/me/avatar/complete',
    ]);
    expect(JSON.parse(calls[0].body as string)).toEqual({ content_type: 'image/png', file_size_bytes: 100 });
    expect(calls[1].headers).toEqual({ 'Content-Type': 'image/png' });
    expect(calls[1].body).toBe(picture);
    expect(JSON.parse(calls[2].body as string)).toEqual({ upload_id: ticket.upload_id });
  });

  it('does not call the server for a file the browser can already refuse', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(uploadAvatar(file('image/svg+xml', 10))).rejects.toMatchObject({ detailCodes: ['unsupported_image'] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails with upload_failed when the storage PUT is refused, and never completes', async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      url === '/api/v1/me/avatar' ? envelope(ticket, 201) : new Response(null, { status: 403 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const error = await uploadAvatar(file('image/png', 100)).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(apiErrorKey(error)).toBe('api.upload_failed');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('fails with upload_failed when the storage cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/v1/me/avatar') return envelope(ticket, 201);
        throw new TypeError('network');
      }),
    );
    const error = await uploadAvatar(file('image/png', 100)).catch((e) => e);
    expect(apiErrorKey(error)).toBe('api.upload_failed');
  });
});
