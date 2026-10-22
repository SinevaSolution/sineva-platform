import { describe, expect, it } from 'vitest';
import { collapsedCookieNeedsSeed, themeToApply } from '@/client/lib/preference_sync_model';

describe('themeToApply (server preference against this device)', () => {
  it('applies a stored light or dark choice that differs from the device', () => {
    expect(themeToApply({ stored: 'dark', local: 'light', alreadySynced: false })).toBe('dark');
    expect(themeToApply({ stored: 'light', local: 'dark', alreadySynced: false })).toBe('light');
    expect(themeToApply({ stored: 'dark', local: 'system', alreadySynced: false })).toBe('dark');
    expect(themeToApply({ stored: 'dark', local: undefined, alreadySynced: false })).toBe('dark');
  });

  it('does nothing when they already agree', () => {
    expect(themeToApply({ stored: 'dark', local: 'dark', alreadySynced: false })).toBeNull();
  });

  it('does nothing for the stored default "system": it also means "never chose", so it must not override this device', () => {
    expect(themeToApply({ stored: 'system', local: 'dark', alreadySynced: false })).toBeNull();
    expect(themeToApply({ stored: 'system', local: 'light', alreadySynced: false })).toBeNull();
  });

  it('applies at most once per session so a later local toggle is not undone by the server value', () => {
    expect(themeToApply({ stored: 'dark', local: 'light', alreadySynced: true })).toBeNull();
  });
});

describe('collapsedCookieNeedsSeed', () => {
  it('seeds the cookie only when it is absent, so the cookie stays the fast path', () => {
    expect(collapsedCookieNeedsSeed('a=1; b=2')).toBe(true);
    expect(collapsedCookieNeedsSeed('sineva_sidebar=expanded; a=1')).toBe(false);
    expect(collapsedCookieNeedsSeed('a=1; sineva_sidebar=collapsed')).toBe(false);
    expect(collapsedCookieNeedsSeed('')).toBe(true);
  });
});
