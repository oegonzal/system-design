import { afterEach } from 'vitest';

/**
 * jsdom implements neither `matchMedia`, `ResizeObserver` nor
 * `scrollIntoView`.
 *
 * Spinner and Skeleton branch on media queries, canvas libraries observe
 * their container, and roving-focus widgets scroll their active item into
 * view — so without these stubs every spec that touches such a component
 * throws rather than failing on an assertion.
 *
 * The matchMedia stub is deliberately *controllable* rather than a constant
 * `false`: a media-query branch whose queries never match is not being
 * tested.
 */

const DEFAULT_WIDTH = 1024;

let viewportWidth = DEFAULT_WIDTH;
let prefersReducedMotion = false;

type Listener = (event: { matches: boolean; media: string }) => void;

interface Registration {
  media: string;
  listeners: Set<Listener>;
}

const registrations = new Set<Registration>();

function evaluate(media: string): boolean {
  const minWidth = /\(min-width:\s*(\d+)px\)/.exec(media);
  if (minWidth) return viewportWidth >= Number(minWidth[1]);
  if (media.includes('prefers-reduced-motion')) return prefersReducedMotion;
  return false;
}

function notify(): void {
  for (const registration of registrations) {
    const event = { media: registration.media, matches: evaluate(registration.media) };
    for (const listener of registration.listeners) listener(event);
  }
}

/** Drive the breakpoint from a spec: `setViewportWidth(480)`. */
export function setViewportWidth(px: number): void {
  viewportWidth = px;
  notify();
}

/** Drive the OS motion preference from a spec. */
export function setPrefersReducedMotion(value: boolean): void {
  prefersReducedMotion = value;
  notify();
}

window.matchMedia = (media: string): MediaQueryList => {
  const registration: Registration = { media, listeners: new Set() };
  registrations.add(registration);

  return {
    media,
    get matches() {
      return evaluate(media);
    },
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => registration.listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) =>
      registration.listeners.delete(listener),
    // Deprecated but still what some libraries reach for.
    addListener: (listener: Listener) => registration.listeners.add(listener),
    removeListener: (listener: Listener) => registration.listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
};

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

/**
 * `setupFiles` runs once per test *file*, not per test, so this module's
 * state would otherwise leak from a spec that set a narrow viewport into
 * every test after it in the same file.
 */
afterEach(() => {
  viewportWidth = DEFAULT_WIDTH;
  prefersReducedMotion = false;
  registrations.clear();
});
