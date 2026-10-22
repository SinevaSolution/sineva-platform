// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BusinessProfileScreen } from '@/client/components/onboarding/business_profile_screen';
import { PROFILE_FIELD_KEYS, type BusinessProfileResultView } from '@/shared/business_profile_view';
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
const profile = {
  ...Object.fromEntries(PROFILE_FIELD_KEYS.map((key) => [key, null])),
  id: null,
  workspace_id: 'ws-1',
  version: 3,
  display_name: 'Original business',
  field_meta: {},
  confirmed_at: null,
  updated_by: null,
  updated_at: null,
} as BusinessProfileResultView['profile'];
function setup(canEdit = true) {
  render(
    <I18nProvider locale="en" messages={CATALOGS.en}>
      <BusinessProfileScreen
        workspaceId="ws-1"
        workspaceSlug="acme"
        canEdit={canEdit}
        result={{ profile, offerings: [], policies: [] }}
        versions={[]}
      />
    </I18nProvider>,
  );
}
it('keeps member and viewer profile access read-only', () => {
  setup(false);
  expect(screen.queryByRole('button', { name: 'Save and confirm' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Read website' })).toBeNull();
  expect(api).not.toHaveBeenCalled();
  expect(
    (
      screen
        .getByRole('textbox', { name: 'Business name' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(true);
});
it('sends the version being edited and preserves untouched profile sections', async () => {
  api.mockResolvedValue({ warnings: [] });
  setup();
  fireEvent.change(screen.getByRole('textbox', { name: 'Business name' }), {
    target: { value: 'Updated business' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save and confirm' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/profile', {
      method: 'PUT',
      body: expect.objectContaining({ display_name: 'Updated business', base_version: 3 }),
    }),
  );
  expect(api.mock.calls[0][1].body).not.toHaveProperty('goals');
  expect(api.mock.calls[0][1].body).not.toHaveProperty('social_handles');
});
it('requires deliberate adoption and save of scan suggestions', async () => {
  api
    .mockResolvedValueOnce({
      scan: {
        id: 'scan-1',
        url: 'https://example.com',
        status: 'succeeded',
        result: {
          fields: {
            display_name: {
              value: 'Website suggestion',
              evidence_snippet: 'Name from the page',
              source_url: 'https://example.com',
            },
          },
        },
      },
    })
    .mockResolvedValue({ warnings: [] });
  setup();
  const websites = screen.getAllByRole('textbox', { name: 'Website URL' });
  fireEvent.change(websites[1], { target: { value: 'https://example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Read website' }));
  await screen.findByRole('button', { name: 'Use this business name' });
  expect((screen.getByRole('textbox', { name: 'Business name' }) as HTMLInputElement).value).toBe(
    'Original business',
  );
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Use this business name' }));
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save and confirm' }));
  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith('/api/v1/workspaces/ws-1/profile', {
      method: 'PUT',
      body: expect.objectContaining({
        display_name: 'Website suggestion',
        scan_id: 'scan-1',
        field_sources: { display_name: 'website' },
      }),
    }),
  );
});
