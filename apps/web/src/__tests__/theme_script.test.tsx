import Script from 'next/script';
import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT } from '@sineva/ui/theme';
import { ThemeScript } from '@/client/components/theme_script';

// A raw <script> in the React tree makes React 19 warn ("Encountered a script
// tag while rendering React component") and never runs it on the client.
// next/script with beforeInteractive is injected by Next before hydration.
describe('ThemeScript', () => {
  it('uses next/script before interactive, with the CSP nonce and the theme code', () => {
    const el = ThemeScript({ nonce: 'abc123' });
    expect(el.type).toBe(Script);
    expect(el.props.strategy).toBe('beforeInteractive');
    expect(el.props.id).toBe('sineva-theme');
    expect(el.props.nonce).toBe('abc123');
    expect(el.props.children).toBe(THEME_SCRIPT);
  });

  it('passes no nonce when none is provided (CSP off in development)', () => {
    const el = ThemeScript({});
    expect(el.props.nonce).toBeUndefined();
    expect(el.props.id).toBe('sineva-theme');
  });
});
