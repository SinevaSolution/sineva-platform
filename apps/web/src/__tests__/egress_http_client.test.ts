import { describe, expect, it, vi } from 'vitest';
import { ConnectorUnreachableError } from '@/server/domain/connections/connector';
import { EgressDeniedError, EgressHttpClient } from '@/server/infrastructure/connectors/egress_http_client';

const allowed = (provider: string, url: string) => provider === 'p' && url.startsWith('https://api.example.test/ok');

function client(fetchImpl: typeof fetch, extra: { timeoutMs?: number; maxResponseBytes?: number } = {}) {
  return new EgressHttpClient({ isAllowed: allowed, fetchImpl, ...extra });
}

describe('EgressHttpClient (ADR-0037 egress allowlist)', () => {
  it('refuses a URL outside the allowlist before any request is made', async () => {
    const fetchImpl = vi.fn();
    await expect(
      client(fetchImpl as unknown as typeof fetch).request({ provider_id: 'p', method: 'GET', url: 'https://evil.example/ok' }),
    ).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(
      client(fetchImpl as unknown as typeof fetch).request({ provider_id: 'other', method: 'GET', url: 'https://api.example.test/ok' }),
    ).rejects.toBeInstanceOf(EgressDeniedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes method, headers and body and returns status and text', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}', { status: 201 }));
    const result = await client(fetchImpl as unknown as typeof fetch).request({
      provider_id: 'p',
      method: 'POST',
      url: 'https://api.example.test/ok/x',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
    expect(result).toEqual({ status: 201, body: '{"ok":true}' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/ok/x');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
  });

  it('never follows a redirect (a redirect would skip the allowlist)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    await client(fetchImpl as unknown as typeof fetch).request({ provider_id: 'p', method: 'GET', url: 'https://api.example.test/ok' });
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('error');
  });

  it('turns a network failure or a refused redirect into an unreachable error without quoting the cause', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('connect ECONNREFUSED with token abc123');
    });
    const error = await client(fetchImpl as unknown as typeof fetch)
      .request({ provider_id: 'p', method: 'GET', url: 'https://api.example.test/ok' })
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(ConnectorUnreachableError);
    expect(`${(error as Error).message}`).not.toContain('abc123');
  });

  it('rejects a response over the size cap, declared or actual', async () => {
    const big = vi.fn(async () => new Response('x'.repeat(2000), { status: 200 }));
    await expect(
      client(big as unknown as typeof fetch, { maxResponseBytes: 1000 }).request({ provider_id: 'p', method: 'GET', url: 'https://api.example.test/ok' }),
    ).rejects.toBeInstanceOf(ConnectorUnreachableError);
  });

  it('gives up after the timeout', async () => {
    const hang = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')));
      }),
    );
    await expect(
      client(hang as unknown as typeof fetch, { timeoutMs: 20 }).request({ provider_id: 'p', method: 'GET', url: 'https://api.example.test/ok' }),
    ).rejects.toBeInstanceOf(ConnectorUnreachableError);
  });
});

it('cancels a chunked oversized body before buffering the entire response', async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode('123456'));
      if (pulls === 100) controller.close();
    },
    cancel() { cancelled = true; },
  });
  const client = new EgressHttpClient({ isAllowed: () => true, maxResponseBytes: 8, fetchImpl: async () => new Response(body) });
  await expect(client.request({ provider_id: 'gmail', method: 'GET', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages' })).rejects.toBeInstanceOf(ConnectorUnreachableError);
  expect(cancelled).toBe(true);
  expect(pulls).toBeLessThan(100);
});
