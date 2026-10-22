// Every interactive element shows a 2 px --color-focus ring with a 2 px offset
// on :focus-visible (FR-UX-09). An outline, not a box-shadow ring: it follows
// border-radius in current browsers and stays visible in forced-colors mode.
// Gotcha: an `overflow-hidden` ancestor still clips it, so leave room around
// focusable children of such containers, or use `focusRingInset`.
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

// Inside clipping containers (sidebar, menus, table cells, step lists) the
// ring is drawn 2 px inward so `overflow` does not cut it.
export const focusRingInset =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus';

// The visible height stays small for sm buttons and chips (36 px) while the
// pointer and touch target grows to 44 px through an invisible pseudo-element.
// Requires `relative` on the element. A pseudo-element rather than padding or
// min-height because the visible box must stay 36 px. `inset-x-0` instead of
// left/right keeps it free of physical directions.
export const hitArea44 =
  "after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']";
