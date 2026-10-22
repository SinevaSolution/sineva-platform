// jsdom lacks several browser APIs that Radix (popper, select, scroll lock) and
// cmdk call while a popup opens. A component test calls `installDomPolyfills()`
// once at the top of the file; each stub is the smallest no-op that lets the
// component run, not a behavior model.
export function installDomPolyfills(): void {
  const g = globalThis as unknown as Record<string, unknown>;

  if (!g.ResizeObserver) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};

  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
}

/** A matchMedia that answers `matches` for every query (used for the 768 px breakpoint). */
export function mockMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
