import Script from 'next/script';
import { THEME_SCRIPT } from '@sineva/ui/theme';

/**
 * Sets `<html data-theme>` before the first paint so the page never flashes
 * the other theme. Render it once in the root layout.
 *
 * next/script with `beforeInteractive`, not a raw `<script>`: a script element
 * inside the React tree is part of the RSC payload, so React 19 recreates it
 * on the client, warns ("Encountered a script tag while rendering React
 * component") and never runs it there. Next injects `beforeInteractive`
 * scripts into the document head ahead of hydration, outside React's tree.
 * The code is a constant string; `nonce` lets the report-only CSP issued by
 * the proxy allow exactly this inline script (OQ-UX-11).
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  return (
    // The rule predates the App Router: there, the root layout is the
    // documented home of beforeInteractive scripts (no pages/_document).
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script id="sineva-theme" strategy="beforeInteractive" nonce={nonce}>
      {THEME_SCRIPT}
    </Script>
  );
}
