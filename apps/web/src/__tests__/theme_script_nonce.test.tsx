import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/client/store/provider';

describe('Theme script carries the CSP nonce (OQ-UX-11)', () => {
  it('tags the inline theme script with the nonce given to AppProviders', () => {
    const html = renderToString(
      <AppProviders nonce="abc123nonce">
        <main>content</main>
      </AppProviders>,
    );
    expect(html).toContain('nonce="abc123nonce"');
  });

  it('renders without a nonce when none is provided', () => {
    const html = renderToString(
      <AppProviders>
        <main>content</main>
      </AppProviders>,
    );
    expect(html).not.toContain('nonce=');
  });
});
