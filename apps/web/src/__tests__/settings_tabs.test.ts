import { describe, expect, it } from 'vitest';
import { parseSettingsTab, settingsTabHref } from '@/client/components/settings/settings_tabs';

describe('parseSettingsTab', () => {
  it('reads the three tabs', () => {
    expect(parseSettingsTab('profile')).toBe('profile');
    expect(parseSettingsTab('preferences')).toBe('preferences');
    expect(parseSettingsTab('sign_in')).toBe('sign_in');
  });

  it('falls back to profile for anything else', () => {
    expect(parseSettingsTab(undefined)).toBe('profile');
    expect(parseSettingsTab('billing')).toBe('profile');
    expect(parseSettingsTab('')).toBe('profile');
    expect(parseSettingsTab(['preferences', 'sign_in'])).toBe('preferences');
  });
});

describe('settingsTabHref', () => {
  it('keeps the default tab on the clean URL', () => {
    expect(settingsTabHref('acme', 'profile')).toBe('/w/acme/settings/profile');
    expect(settingsTabHref('acme', 'preferences')).toBe('/w/acme/settings/profile?tab=preferences');
  });
});
