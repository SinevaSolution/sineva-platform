// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InboxDetail } from '@/client/components/inbox/inbox_detail';
import type { InboxItemView } from '@/shared/inbox_view';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
const api = vi.hoisted(() => vi.fn());
vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const item: InboxItemView = {
  id: 'item-1',
  kind: 'approval',
  tab: 'needs_review',
  state: 'open',
  agent_slug: 'sinosocial',
  title: 'Friday post',
  summary: { key: 'inbox.sentence.draft_review', params: {} },
  source: { type: 'chat', id: null },
  unread: false,
  expires_at: null,
  resolved_at: null,
  created_at: '2026-10-22T00:00:00Z',
  approval: {
    id: 'approval-1',
    status: 'pending',
    action_type: 'draft.review',
    revision: 1,
    version: 7,
    awaiting_revision: false,
    risk_level: 'low',
    requirement: 'guardrail',
    guardrail_reason: null,
    expires_at: '2026-10-29T00:00:00Z',
    decided_by: null,
    decided_by_name: null,
    decided_at: null,
  },
  input_request: null,
  payload: { draft_kind: 'post', title: 'Friday', body: '<script>hostile()</script>' },
  editable_fields: ['title', 'body'],
};
function setup(readOnly = false, data = item) {
  render(
    <I18nProvider locale="en" messages={CATALOGS.en}>
      <InboxDetail item={data} workspaceId="ws-1" workspaceSlug="acme" readOnly={readOnly} />
    </I18nProvider>,
  );
}
it('renders draft text escaped and sends the version actually reviewed', async () => {
  api.mockResolvedValue({});
  setup();
  expect(screen.getByText('<script>hostile()</script>')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Approve draft' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/approvals/approval-1/decision', {
      method: 'POST',
      body: { version: 7, decision: 'approve' },
    }),
  );
});
it('never renders decisions for a viewer or an approval awaiting revision', () => {
  setup(true);
  expect(screen.queryByRole('button', { name: 'Approve draft' })).toBeNull();
  cleanup();
  setup(false, { ...item, approval: { ...item.approval!, awaiting_revision: true } });
  expect(screen.queryByRole('button', { name: 'Approve draft' })).toBeNull();
});
it('keeps failed decisions visible and retryable', async () => {
  api.mockRejectedValue(new Error('private upstream details'));
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Approve draft' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Approve draft' }).hasAttribute('disabled')).toBe(
    false,
  );
  expect(screen.queryByText('private upstream details')).toBeNull();
});
