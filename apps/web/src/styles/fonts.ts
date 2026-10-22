import { Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';

// next/font downloads the files at build time and serves them from our own
// origin, so there are no runtime requests to Google. Both are variable fonts:
// no `weight` option, which would switch next/font to one static file per
// weight and blow the 120 KB budget (FR-UX-07). Only `latin` and `latin-ext`
// are listed; the browser downloads a subset file only when a glyph in its
// unicode-range is actually used.
//
// The CSS variable names are read by `--font-sans` and `--font-mono` in
// packages/ui/src/styles/tokens.css, which Tailwind exposes as `font-sans` and
// `font-mono`. Apply `.variable` on <html> so both are defined for the whole
// document. next/font must run in the app, which is why this file does not
// live in packages/ui.
export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-plus-jakarta-sans',
});

export const geistMono = Geist_Mono({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-geist-mono',
});
