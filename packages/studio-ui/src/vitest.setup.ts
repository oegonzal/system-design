/**
 * jsdom shims for the canvas suite.
 *
 * React Flow's documented testing setup: the library measures its container
 * (ResizeObserver + offsetWidth/offsetHeight), reads the pane transform
 * through DOMMatrixReadOnly, and measures SVG labels with getBBox — none of
 * which jsdom implements. Without these, every spec that mounts `<ReactFlow>`
 * throws before a single assertion runs.
 */

/** Minimal `DOMMatrixReadOnly`: React Flow only reads the zoom out of `m22`. */
class DOMMatrixReadOnlyStub {
  m22: number;

  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

(globalThis as Record<string, unknown>)['DOMMatrixReadOnly'] = DOMMatrixReadOnlyStub;

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

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// A fixed, non-zero viewport so React Flow believes it has room to render.
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => 800 },
  offsetHeight: { configurable: true, get: () => 600 },
});

(SVGElement.prototype as unknown as Record<string, unknown>)['getBBox'] = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});

Element.prototype.scrollIntoView = function scrollIntoView() {
  /* jsdom has no layout, so there is nothing to scroll. */
};

/** Spinner/Skeleton branch on media queries; a constant non-match is fine here. */
window.matchMedia = ((query: string) =>
  ({
    media: query,
    matches: false,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }) as unknown as MediaQueryList) as typeof window.matchMedia;
