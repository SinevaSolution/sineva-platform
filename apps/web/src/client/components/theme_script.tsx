import { THEME_SCRIPT } from '@sineva/ui/theme';

/**
 * Sets `<html data-theme>` before the first paint so the page never flashes
 * the other theme. Render it inside `<head>` of the root layout.
 *
 * The script is a constant string, so it goes in as the element's text
 * (React does not escape script children) rather than through
 * `dangerouslySetInnerHTML`, which lint bans. `nonce` lets the report-only CSP
 * issued by the proxy allow exactly this inline script (OQ-UX-11).
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce}>{THEME_SCRIPT}</script>;
}
