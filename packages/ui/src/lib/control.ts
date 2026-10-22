// Shared look of text-like controls (input, textarea, select trigger,
// combobox trigger): 44 px tall, hairline border, focus border plus halo.
// 15 px type on fine pointers and 16 px on coarse ones, so iOS Safari does not
// zoom the page when a field takes focus.
//
// Static strings on purpose: Tailwind scans source for class names, so the
// pieces cannot be assembled at runtime.
export const controlSurface =
  'w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] pointer-coarse:text-base text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-tertiary focus:border-focus focus:shadow-(--shadow-focus-halo) aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-45 read-only:cursor-default read-only:bg-canvas-alt read-only:text-text-secondary';

export const controlHeight = 'h-11';
