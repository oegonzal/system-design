/**
 * jsdom implements neither `matchMedia`, `ResizeObserver` nor
 * `scrollIntoView`.
 *
 * Spinner and Skeleton branch on media queries, canvas libraries observe
 * their container, and roving-focus widgets scroll their active item into
 * view — so without these stubs every spec that touches such a component
 * throws rather than failing on an assertion.
 *
 * The matchMedia stub answers as a desktop-width window with no motion
 * preference: a `min-width` query matches up to that width, nothing else does.
 */

const VIEWPORT_WIDTH = 1024;

function evaluate(media: string): boolean {
  const minWidth = /\(min-width:\s*(\d+)px\)/.exec(media);
  return minWidth ? VIEWPORT_WIDTH >= Number(minWidth[1]) : false;
}

window.matchMedia = (media: string): MediaQueryList =>
  ({
    media,
    matches: evaluate(media),
    onchange: null,
    // The answer never changes, so no listener is ever called.
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    // Deprecated but still what some libraries reach for.
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }) as unknown as MediaQueryList;

/** No layout in jsdom, so observations never fire — but construction must not throw. */
class ResizeObserverStub {
  observe(): void {
    /* no layout to observe */
  }
  unobserve(): void {
    /* nothing was observed */
  }
  disconnect(): void {
    /* nothing to disconnect */
  }
}

window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

Element.prototype.scrollIntoView = function scrollIntoView() {
  /* jsdom has no layout, so there is nothing to scroll. */
};
