import { describe, expect, it } from 'vitest';
import {
  activeSettingsItem,
  buildSettingsNav,
  businessProfileCompleteness,
} from '@/client/components/settings/settings_nav_model';

const ids = (role: string, group: 'account' | 'workspace') =>
  buildSettingsNav('acme', role).find((g) => g.id === group)?.items.map((i) => i.id) ?? [];

describe('buildSettingsNav', () => {
  it('has the two groups in order', () => {
    expect(buildSettingsNav('acme', 'owner').map((g) => g.id)).toEqual(['account', 'workspace']);
  });

  it('gives every role the three account items with stable URLs', () => {
    for (const role of ['owner', 'admin', 'member', 'viewer']) {
      expect(ids(role, 'account')).toEqual(['profile', 'preferences', 'sign_in']);
    }
    const account = buildSettingsNav('acme', 'member')[0].items;
    expect(account.map((i) => i.href)).toEqual([
      '/w/acme/settings/profile',
      '/w/acme/settings/profile?tab=preferences',
      '/w/acme/settings/profile?tab=sign_in',
    ]);
  });

  it('shows owner and admin every workspace item, planned ones as Soon without a link', () => {
    for (const role of ['owner', 'admin']) {
      expect(ids(role, 'workspace')).toEqual([
        'business',
        'members',
        'usage',
        'tools',
        'models',
        'billing',
        'security',
      ]);
    }
    const items = buildSettingsNav('acme', 'owner')[1].items;
    const soon = items.filter((i) => i.soon).map((i) => i.id);
    expect(soon).toEqual(['usage', 'tools', 'models', 'billing', 'security']);
    for (const item of items.filter((i) => i.soon)) expect(item.href).toBeNull();
    expect(items.find((i) => i.id === 'business')?.href).toBe('/w/acme/settings/business');
    expect(items.find((i) => i.id === 'members')?.href).toBe('/w/acme/settings/members');
  });

  it('never links to the usage page', () => {
    const hrefs = buildSettingsNav('acme', 'owner').flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs.some((h) => h?.includes('/settings/usage'))).toBe(false);
  });

  it('hides the manager-only planned items from members and viewers, keeping the read-only pages', () => {
    for (const role of ['member', 'viewer']) {
      expect(ids(role, 'workspace')).toEqual(['business', 'members']);
    }
  });
});

describe('activeSettingsItem', () => {
  it('maps a path and tab to the nav item', () => {
    expect(activeSettingsItem('/w/acme/settings/profile', null)).toBe('profile');
    expect(activeSettingsItem('/w/acme/settings/profile', 'preferences')).toBe('preferences');
    expect(activeSettingsItem('/w/acme/settings/profile', 'sign_in')).toBe('sign_in');
    expect(activeSettingsItem('/w/acme/settings/profile', 'bogus')).toBe('profile');
    expect(activeSettingsItem('/w/acme/settings/members', null)).toBe('members');
    expect(activeSettingsItem('/w/acme/settings/business', null)).toBe('business');
    expect(activeSettingsItem('/w/acme/settings', null)).toBeNull();
  });
});

describe('businessProfileCompleteness', () => {
  const empty = {
    display_name: null,
    legal_name: null,
    industry: null,
    city: null,
    province: null,
    languages: null,
    website_url: null,
    social_handles: null,
    business_hours: null,
    brand_voice: null,
    audience: null,
    goals: null,
  };
  it('is 0 for an empty profile', () => {
    expect(businessProfileCompleteness(empty)).toBe(0);
  });
  it('counts only filled fields, ignoring blanks and empty lists', () => {
    expect(
      businessProfileCompleteness({
        ...empty,
        display_name: 'Warung Maju',
        industry: '  ',
        languages: [],
        goals: ['faster_replies'],
        social_handles: {},
        city: 'Bandung',
      }),
    ).toBe(25);
  });
  it('is 100 when everything is filled', () => {
    expect(
      businessProfileCompleteness({
        display_name: 'a',
        legal_name: 'a',
        industry: 'a',
        city: 'a',
        province: 'a',
        languages: ['id'],
        website_url: 'a',
        social_handles: { instagram: 'a' },
        business_hours: { note: 'a' },
        brand_voice: { formality: 'casual' },
        audience: 'a',
        goals: ['faster_replies'],
      }),
    ).toBe(100);
  });
});
