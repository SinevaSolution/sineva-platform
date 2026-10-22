import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeScript } from '@/client/components/theme_script';
import { THEME_SCRIPT } from '@sineva/ui/theme';

describe('Theme script carries the CSP nonce (OQ-UX-11)', () => {
  it('tags the inline theme script with the nonce it is given', () => {
    const html = renderToString(<ThemeScript nonce="abc123nonce" />);
    expect(html).toContain('nonce="abc123nonce"');
    expect(html).toContain(THEME_SCRIPT);
  });

  it('renders without a nonce when none is provided', () => {
    const html = renderToString(<ThemeScript />);
    expect(html).not.toContain('nonce=');
    expect(html).toContain('sineva-theme');
  });
});
