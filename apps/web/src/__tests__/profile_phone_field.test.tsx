// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileForm } from '@/client/components/settings/profile_form';
import { CATALOGS } from '@/i18n/catalogs';
import { I18nProvider } from '@/i18n/provider';
import { SNTooltipProvider } from '@sineva/ui';
import type { MemberProfileView, ProfileView } from '@/shared/profile_view';

const apiRequest = vi.fn();
vi.mock('@/client/lib/api', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const profile: ProfileView = {
  id: 'usr-1',
  email: 'amira@example.com',
  email_verified: true,
  full_name: 'Amira Putri',
  preferred_name: null,
  salutation: null,
  phone_number: null,
  phone_verified: false,
  about_me: null,
  use_profile_in_context: true,
  avatar_url: null,
  locale: 'en',
  timezone: 'Asia/Jakarta',
  created_at: '2026-10-01T00:00:00.000Z',
};
const member: MemberProfileView = { job_title: null, department: null };

function renderForm(overrides: Partial<ProfileView> = {}) {
  return render(
    <I18nProvider locale="en" messages={CATALOGS.en}>
      <SNTooltipProvider>
        <ProfileForm
          profile={{ ...profile, ...overrides }}
          member={member}
          workspace={{ id: '33333333-3333-4333-8333-333333333333', name: 'Sineva HQ', role: 'owner' }}
          timeZones={['Asia/Jakarta']}
        />
      </SNTooltipProvider>
    </I18nProvider>,
  );
}

const phone = () => screen.getByLabelText('Phone number') as HTMLInputElement;
const save = () => screen.queryByRole('button', { name: 'Save changes' }) as HTMLButtonElement | null;

beforeAll(() => {
  // jsdom has no ResizeObserver; Radix popper (the country list's anchor) reads it on mount.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(cleanup);

describe('profile phone number field', () => {
  it('labels the number input with the row label and starts on Indonesia', () => {
    renderForm();
    expect(phone().value).toBe('');
    expect(screen.getByRole('combobox', { name: 'Country code: Indonesia +62' })).toBeTruthy();
  });

  it('saves a national number with a leading 0 as E.164 and clears the unsaved bar once confirmed', async () => {
    apiRequest.mockResolvedValue({ ...profile, phone_number: '+6281234567890' });
    renderForm();
    fireEvent.change(phone(), { target: { value: '0812 3456 7890' } });
    const button = save();
    expect(button?.disabled).toBe(false);
    fireEvent.click(button as HTMLButtonElement);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/me', { method: 'PATCH', body: { phone_number: '+6281234567890' } });
    await waitFor(() => expect(save()).toBeNull());
    expect(phone().value).toBe('0812-3456-7890');
  });

  it('shows the form error and blocks Save for an unfinished number', () => {
    renderForm();
    fireEvent.change(phone(), { target: { value: '0812 34' } });
    fireEvent.blur(phone());
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid phone number for the selected country.');
    expect(phone().getAttribute('aria-invalid')).toBe('true');
    expect(save()?.disabled).toBe(true);
    fireEvent.click(save() as HTMLButtonElement);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('allows an empty phone: clearing a saved number saves null', async () => {
    apiRequest.mockResolvedValue({ ...profile, phone_number: null });
    renderForm({ phone_number: '+6281234567890' });
    fireEvent.change(phone(), { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(save() as HTMLButtonElement);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/me', { method: 'PATCH', body: { phone_number: null } });
  });

  it('switches country on a pasted +44 number and saves it in E.164', async () => {
    apiRequest.mockResolvedValue({ ...profile, phone_number: '+447400123456' });
    renderForm();
    fireEvent.change(phone(), { target: { value: '+44 7400 123456' } });
    expect(screen.getByRole('combobox', { name: 'Country code: United Kingdom +44' })).toBeTruthy();
    fireEvent.click(save() as HTMLButtonElement);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/me', { method: 'PATCH', body: { phone_number: '+447400123456' } });
  });

  it('discard puts the saved number and its country back', () => {
    renderForm({ phone_number: '+6281234567890' });
    fireEvent.change(phone(), { target: { value: '+44 7400 123456' } });
    expect(phone().value).not.toBe('0812-3456-7890');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(phone().value).toBe('0812-3456-7890');
    expect(screen.getByRole('combobox', { name: 'Country code: Indonesia +62' })).toBeTruthy();
  });
});
