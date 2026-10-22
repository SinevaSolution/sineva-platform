import type { MetadataRoute } from 'next';

// Icons and colours come from sineva-compro (src/app/manifest.ts) so the app
// and the site install with the same mark. The background is the white the
// icons are drawn on; the theme colour is the brand teal
// (`--color-action-primary`). Next.js cannot read CSS here.
const BACKGROUND_COLOR = '#ffffff';
const THEME_COLOR = '#00686d';

// One PNG per size, listed once per purpose: launchers handle
// `purpose: 'any maskable'` inconsistently. The mark sits at 60 percent on a
// solid background, so the maskable safe zone stays clear.
const ICON_SIZES = [192, 512] as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sineva',
    short_name: 'Sineva',
    start_url: '/',
    display: 'standalone',
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: ICON_SIZES.flatMap((size) =>
      (['any', 'maskable'] as const).map((purpose) => ({
        src: `/brand/icon-${size}.png`,
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose,
      })),
    ),
  };
}
