import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PreferencesForm } from '@/client/components/settings/preferences_form';
import { ProfileForm } from '@/client/components/settings/profile_form';
import { SignInMethods } from '@/client/components/settings/sign_in_methods';
import { SNTooltipProvider } from '@sineva/ui';
import { CATALOGS } from '@/i18n/catalogs';
import { I18nProvider } from '@/i18n/provider';
import type { PreferencesView, ProfileView } from '@/shared/profile_view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const profile: ProfileView = {
  id: 'usr-1',
  email: 'faishal@example.com',
  email_verified: true,
  full_name: 'Muhammad Faishal',
  preferred_name: 'Faishal',
  salutation: 'kak',
  phone_number: '+6281234567890',
  phone_verified: false,
  about_me: 'Founder',
  use_profile_in_context: true,
  avatar_url: null,
  locale: 'id',
  timezone: 'Asia/Jakarta',
  created_at: '2026-10-01T00:00:00.000Z',
};

const preferences: PreferencesView = {
  theme: 'dark',
  density: 'comfortable',
  focus_mode: false,
  reduce_motion: true,
  sidebar_collapsed: false,
  pause_character: false,
  room_view: false,
};

const inLocale = (locale: 'en' | 'id', node: React.ReactNode) =>
  renderToStaticMarkup(
    <I18nProvider locale={locale} messages={CATALOGS[locale]}>
      <SNTooltipProvider>{node}</SNTooltipProvider>
    </I18nProvider>,
  );

const form = (
  <ProfileForm
    profile={profile}
    member={{ job_title: 'Founder', department: 'management' }}
    workspace={{ id: '33333333-3333-4333-8333-333333333333', name: 'Sineva HQ', role: 'owner' }}
    timeZones={['Asia/Jakarta', 'Asia/Makassar']}
  />
);

describe('ProfileForm rendering', () => {
  it('shows the header block: greeting preview, email with a verified pill, role pill, change photo control', () => {
    const html = inLocale('en', form);
    expect(html).toContain('Sino will call you Kak Faishal');
    expect(html).toContain('faishal@example.com');
    expect(html).toContain('Verified');
    expect(html).toContain('Owner');
    expect(html).toContain('aria-label="Change photo"');
    // No avatar: initials stand in.
    expect(html).toContain('>MF<');
  });

  it('lays settings out as labelled rows with helpers, under quiet section titles', () => {
    const html = inLocale('en', form);
    for (const text of ['About you', 'Contact', 'Language and region', 'In Sineva HQ', 'Full name', 'Preferred name', 'Form of address', 'Phone number', 'Job title', 'Department']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('role="switch"');
    expect(html).toContain('7 of 280');
  });

  it('uses SNSelect and SNCombobox for every dropdown, never a native select', () => {
    const html = inLocale('en', form);
    // Locale, time zone, salutation and department are four combobox buttons,
    // and the phone number's country button is the fifth.
    expect(html.match(/role="combobox"/g)).toHaveLength(5);
    // Radix renders its hidden native select only for the form value; the
    // visible controls are buttons.
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('Asia/Jakarta');
    // The searchable one is the time zone.
    expect(html).toMatch(/id="[^"]*-timezone"[^>]*role="combobox"|role="combobox"[^>]*id="[^"]*-timezone"/);
  });

  it('puts a country picker next to the phone number and shows the saved number nationally', () => {
    const html = inLocale('en', form);
    expect(html).toContain('aria-label="Country code: Indonesia +62"');
    expect(html).toContain('value="0812-3456-7890"');
    // The hidden input carries the E.164 value that the form saves.
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*value="\+6281234567890"|<input[^>]*value="\+6281234567890"[^>]*type="hidden"/);
  });

  it('names the country in the UI language', () => {
    const html = inLocale('id', form);
    expect(html).toContain('aria-label="Kode negara: Indonesia +62"');
    expect(html).toContain('Nomor telepon');
  });

  it('starts clean: no save bar until something changes', () => {
    const html = inLocale('en', form);
    expect(html).not.toContain('You have unsaved changes');
  });

  it('speaks Indonesian with kamu forms', () => {
    const html = inLocale('id', form);
    expect(html).toContain('Sino akan memanggilmu Kak Faishal');
    expect(html).toContain('Ganti foto');
    expect(html).toContain('Tentangmu');
    expect(html).toContain('Di Sineva HQ');
    expect(html).not.toContain('Anda');
  });

  it('marks the email as read only', () => {
    expect(inLocale('en', form)).toMatch(/<input[^>]*name="email"[^>]*readOnly=""|<input[^>]*readonly=""[^>]*name="email"/i);
  });
});

describe('PreferencesForm rendering', () => {
  it('offers three theme cards with the saved one checked, density choices and four switches', () => {
    const html = inLocale('en', <PreferencesForm initial={preferences} />);
    expect(html).toContain('role="radiogroup"');
    expect((html.match(/role="radio"/g) ?? []).length).toBe(5);
    expect(html).toContain('Light');
    expect(html).toContain('Dark');
    expect(html).toContain('System');
    expect(html).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>(?:(?!<button).)*Dark/s);
    expect((html.match(/role="switch"/g) ?? []).length).toBe(4);
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
  });

  it('is translated', () => {
    const html = inLocale('id', <PreferencesForm initial={preferences} />);
    expect(html).toContain('Tema');
    expect(html).toContain('Kurangi gerakan');
  });
});

describe('SignInMethods rendering', () => {
  it('shows each method with its real state', () => {
    const html = inLocale(
      'en',
      <SignInMethods
        email="faishal@example.com"
        accounts={[
          { provider: 'google', provider_email: 'faishal@gmail.com', provider_username: null },
          { provider: 'credential', provider_email: null, provider_username: null },
        ]}
      />,
    );
    expect(html).toContain('faishal@gmail.com');
    expect(html).toContain('Linked');
    expect(html).toContain('Not linked');
    expect(html).toContain('Set');
  });
});
