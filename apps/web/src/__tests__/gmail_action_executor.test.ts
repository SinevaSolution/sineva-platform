import { describe, expect, it, vi } from 'vitest';
import { GmailActionExecutor } from '@/server/infrastructure/gateway/gmail_action_executor';
import type { ConnectorHttpClient } from '@/server/domain/connections/connector';

const encoded = (s: string) => Buffer.from(s).toString('base64url');
const message = {
  id: 'm1',
  threadId: 't1',
  snippet: 'Summary',
  internalDate: '1700000000000',
  labelIds: ['UNREAD'],
  payload: {
    headers: [
      { name: 'From', value: 'sender@example.com' },
      { name: 'To', value: 'me@example.com' },
      { name: 'Subject', value: 'Hello' },
      { name: 'Message-ID', value: '<original@example.com>' },
    ],
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/plain', body: { data: encoded('Plain text') } },
      { mimeType: 'text/html', body: { data: encoded('<script>bad()</script>') } },
    ],
  },
};
function setup(responses: unknown[]) {
  const request = vi.fn<ConnectorHttpClient['request']>(async () => ({
    status: 200,
    body: JSON.stringify(responses.shift()),
  }));
  const http: ConnectorHttpClient = { request };
  return { executor: new GmailActionExecutor(http), request };
}
const credentials = { access_token: 'private-access-token' };

describe('Gmail action executor', () => {
  it('searches and resolves message summaries through the allowlisted HTTP port', async () => {
    const { executor, request } = setup([{ messages: [{ id: 'm1' }] }, message]);
    const result = await executor.execute(
      'gmail_search_messages',
      { query: 'from:sender@example.com', max_results: 3 },
      credentials,
      'call-1',
    );
    expect(result).toEqual({
      messages: [
        {
          id: 'm1',
          thread_id: 't1',
          from: 'sender@example.com',
          subject: 'Hello',
          snippet: 'Summary',
          received_at: '2023-11-14T22:13:20.000Z',
          unread: true,
        },
      ],
    });
    expect(new URL(request.mock.calls[0][0].url).searchParams.get('q')).toBe(
      'from:sender@example.com',
    );
    expect(
      request.mock.calls.every(
        ([r]) =>
          r.provider_id === 'gmail' && r.headers?.Authorization === 'Bearer private-access-token',
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-access-token');
  });
  it('reads plain text from nested MIME parts without rendering HTML', async () => {
    const { executor } = setup([message]);
    await expect(
      executor.execute('gmail_get_message', { message_id: 'm1' }, credentials, 'call-2'),
    ).resolves.toMatchObject({ body_text: 'Plain text', to: ['me@example.com'] });
  });
  it('returns an empty search without inventing messages', async () => {
    const { executor, request } = setup([{}]);
    await expect(
      executor.execute(
        'gmail_search_messages',
        { query: '', max_results: 10 },
        credentials,
        'call-3',
      ),
    ).resolves.toEqual({ messages: [] });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['gmail_create_draft', 'gmail_send_message'])(
    'encodes a Unicode message for %s',
    async (action) => {
      const { executor, request } = setup([
        action === 'gmail_create_draft'
          ? { id: 'd1', message: { id: 'm2' } }
          : { id: 'm2', threadId: 't2' },
      ]);
      const result = await executor.execute(
        action,
        {
          to: ['you@example.com'],
          cc: ['copy@example.com'],
          subject: 'Rencana café',
          body_text: 'Halo\r\nBesok ya',
        },
        credentials,
        'call-4',
        { external_account_id: 'account-1', account_label: 'sender@example.com' },
      );
      const sent = JSON.parse(request.mock.calls[0][0].body!);
      const raw = Buffer.from(sent.message?.raw ?? sent.raw, 'base64url').toString();
      expect(raw).toContain('From: sender@example.com\r\n');
      expect(raw).toContain('To: you@example.com\r\n');
      expect(raw).toContain('Cc: copy@example.com\r\n');
      expect(raw).toContain('Subject: =?UTF-8?B?');
      expect(raw).toContain(Buffer.from('Halo\r\nBesok ya').toString('base64'));
      expect(request.mock.calls[0][0].url).toBe(
        `https://gmail.googleapis.com/gmail/v1/users/me/${action === 'gmail_create_draft' ? 'drafts' : 'messages/send'}`,
      );
      expect(result).toMatchObject(
        action === 'gmail_create_draft'
          ? { draft_id: 'd1', message_id: 'm2' }
          : { message_id: 'm2', thread_id: 't2' },
      );
    },
  );
  it('looks up the RFC Message-ID and thread for replies', async () => {
    const { executor, request } = setup([message, { id: 'm2', threadId: 't1' }]);
    await executor.execute(
      'gmail_send_message',
      {
        to: ['you@example.com'],
        subject: 'Re: Hello',
        body_text: 'Reply',
        reply_to_message_id: 'm1',
      },
      credentials,
      'call-5',
      { external_account_id: 'account-1', account_label: 'sender@example.com' },
    );
    const body = JSON.parse(request.mock.calls[1][0].body!);
    expect(body.threadId).toBe('t1');
    expect(Buffer.from(body.raw, 'base64url').toString()).toContain(
      'In-Reply-To: <original@example.com>\r\n',
    );
  });
  it.each([401, 403, 429, 500])(
    'maps provider status %s without leaking its body or retrying',
    async (status) => {
      const request = vi.fn(async () => ({ status, body: 'private-access-token upstream detail' }));
      const executor = new GmailActionExecutor({ request });
      await expect(
        executor.execute('gmail_get_message', { message_id: 'm1' }, credentials, 'call-6'),
      ).rejects.toMatchObject({
        code:
          status === 401
            ? 'connection_needs_reconnect'
            : status === 429
              ? 'rate_limited'
              : 'provider_unavailable',
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it('refuses header injection before making a request', async () => {
    const { executor, request } = setup([]);
    await expect(
      executor.execute(
        'gmail_send_message',
        { to: ['you@example.com'], subject: 'Hi\r\nBcc: secret@example.com', body_text: 'Hello' },
        credentials,
        'call-7',
      ),
    ).rejects.toMatchObject({ code: 'invalid_tool_arguments' });
    expect(request).not.toHaveBeenCalled();
  });
  it('fails on invalid provider JSON', async () => {
    const executor = new GmailActionExecutor({
      request: async () => ({ status: 200, body: 'invalid' }),
    });
    await expect(
      executor.execute('gmail_get_message', { message_id: 'm1' }, credentials, 'call-8'),
    ).rejects.toMatchObject({ code: 'provider_unavailable' });
  });
});
