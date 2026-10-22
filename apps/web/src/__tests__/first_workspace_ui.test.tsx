// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FirstWorkspace } from '@/client/components/onboarding/first_workspace';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
import { ApiError } from '@/client/lib/api';
const api = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup() {
  render(
    <I18nProvider locale="en" messages={CATALOGS.en}>
      <FirstWorkspace />
    </I18nProvider>,
  );
}
it('creates only after an explicit click, and uses the returned workspace slug', async () => {
  api.mockResolvedValue({ workspace: { workspace_slug: 'my-workspace-abc' } });
  setup();
  expect(api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/w/my-workspace-abc/onboarding'));
  expect(api).toHaveBeenCalledWith('/api/v1/me/first-workspace', { method: 'POST' });
});
it('handles a duplicate submission by navigating to the existing workspace entry', async () => {
  api.mockRejectedValue(new ApiError('duplicate', 409, 'conflict', ['already_has_workspace']));
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
});
it('explains pending invitations without creating a second workspace', async () => {
  api.mockRejectedValue(new ApiError('private', 409, 'conflict', ['invited_user']));
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('invitation'));
  expect(nav.replace).not.toHaveBeenCalled();
});
