import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsHub } from '@/client/components/settings/settings_hub';
import { SettingsFrame } from '@/client/components/settings/settings_frame';
import { SNTooltipProvider } from '@sineva/ui';
import { CATALOGS } from '@/i18n/catalogs';
import { I18nProvider } from '@/i18n/provider';

let pathname = '/w/acme/settings';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const render = (locale: 'en' | 'id', node: React.ReactNode) =>
  renderToStaticMarkup(
    <I18nProvider locale={locale} messages={CATALOGS[locale]}>
      <SNTooltipProvider>{node}</SNTooltipProvider>
    </I18nProvider>,
  );

const data = {
  workspaceSlug: 'acme',
  workspaceName: 'Acme Corp',
  userName: 'Faishal',
  userEmail: 'f@acme.com',
  emailVerified: true,
  membersCount: 3,
  profileCompleteness: 42,
  resumeSetup: false,
};

describe('SettingsHub', () => {
  it('owner: header, both groups, live hints and Soon items without links', () => {
    const html = render('en', <SettingsHub {...data} role="owner" />);
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Faishal');
    expect(html).toContain('Your account');
    expect(html).toContain('Workspace');
    expect(html).toContain('href="/w/acme/settings/members"');
    expect(html).toContain('href="/w/acme/settings/business"');
    expect(html).toContain('3 members');
    expect(html).toContain('42% complete');
    expect(html).toContain('Email verified');
    expect(html).toContain('Usage &amp; plan');
    expect((html.match(/>Soon</g) ?? []).length).toBe(5);
    expect(html).not.toContain('/settings/usage');
    expect(html).not.toContain('Resume setup');
  });

  it('member: only the read-only workspace pages, no Soon cards', () => {
    const html = render('en', <SettingsHub {...data} role="member" />);
    expect(html).toContain('href="/w/acme/settings/members"');
    expect(html).not.toContain('Billing');
    expect(html).not.toContain('>Soon<');
  });

  it('shows the resume banner linking to onboarding only when setup is unfinished', () => {
    const html = render('en', <SettingsHub {...data} role="owner" resumeSetup />);
    expect(html).toContain('Resume setup');
    expect(html).toContain('href="/w/acme/onboarding"');
  });

  it('flags an unverified email', () => {
    const html = render('en', <SettingsHub {...data} role="owner" emailVerified={false} />);
    expect(html).toContain('Email not verified');
  });

  it('renders in Indonesian', () => {
    const html = render('id', <SettingsHub {...data} role="owner" />);
    expect(html).toContain('Akunmu');
    expect(html).toContain('Segera');
  });
});

describe('SettingsFrame', () => {
  it('adds the settings nav on sub-pages and marks the current one', () => {
    pathname = '/w/acme/settings/members';
    const html = render(
      'en',
      <SettingsFrame workspaceSlug="acme" role="owner">
        body
      </SettingsFrame>,
    );
    expect(html).toContain('<nav');
    expect(html).toMatch(/aria-current="page"[^>]*>.*Members/s);
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(2); // desktop list + mobile chips
    expect(html).toContain('body');
  });

  it('leaves the hub without the nav', () => {
    pathname = '/w/acme/settings';
    const html = render(
      'en',
      <SettingsFrame workspaceSlug="acme" role="owner">
        body
      </SettingsFrame>,
    );
    expect(html).not.toContain('<nav');
    expect(html).toContain('body');
  });
});
