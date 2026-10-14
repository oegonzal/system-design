import type { Page } from '@playwright/test';

/** One keyboard stop: the element Tab reached, and how its focus is drawn. */
interface FocusStop {
  element: string;
  outlineStyle: string;
  outlineWidth: number;
  /** The outline against what it is painted over (WCAG contrast ratio): the lowest of the parts it lies across. */
  contrast: number;
}

/** What one Tab press reached. */
type Reached =
  | { readonly kind: 'stop'; readonly stop: FocusStop }
  /** The control focused at the press before: its next part (a date field's segments, say). */
  | { readonly kind: 'part' }
  /** The page's end: focus left it. */
  | { readonly kind: 'end' }
  /** Focus came back to an earlier stop before leaving the page: a keyboard trap. */
  | { readonly kind: 'trap'; readonly element: string };

/** A DOM node as the DevTools protocol reports it, with what `pierce` adds. */
interface ProtocolNode {
  readonly nodeType: number;
  readonly children?: readonly ProtocolNode[];
  readonly shadowRoots?: readonly ProtocolNode[];
  readonly contentDocument?: ProtocolNode;
}

/** The DOM's node type for an element. */
const ELEMENT_NODE = 1;

/**
 * Every element the browser holds for the page, closed and built-in shadow
 * trees (a date field's segments) and every frame included, a cross-origin
 * frame through its own session. Each Tab stop, a control's parts among them,
 * is one of these, so a walk that leaves the page takes no more presses.
 */
async function elementCount(page: Page): Promise<number> {
  const count = (node: ProtocolNode): number =>
    (node.nodeType === ELEMENT_NODE ? 1 : 0) +
    [
      ...(node.children ?? []),
      ...(node.shadowRoots ?? []),
      ...(node.contentDocument === undefined ? [] : [node.contentDocument]),
    ].reduce((total, child) => total + count(child), 0);
  let total = 0;
  for (const frame of page.frames()) {
    // A frame in the page's own process is in its tree already, and has no session of its own.
    const session = await page
      .context()
      .newCDPSession(frame === page.mainFrame() ? page : frame)
      .catch(() => null);
    if (session === null) continue;
    const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
    await session.detach();
    total += count(root);
  }
  return total;
}

/**
 * Tabs through the page from its first stop, reading each stop's focus outline,
 * until focus leaves the page; whatever has focus once the page has loaded (an
 * autofocus, a script's focus()) is tabbed past first. A stop is the element
 * that has focus, inside any open shadow root or same-origin frame; a control
 * that takes several presses (a date field's segments) is one stop. Coming back
 * to any earlier stop before focus leaves is a keyboard trap, and fails. A
 * closed shadow root or a cross-origin frame is one stop too, judged by its
 * host's or frame's own outline, and the stops inside it are not measured;
 * Chromium matches no focus pseudo-class on a frame whose content has focus, so
 * such a frame passes only with an outline it always shows.
 *
 * An outline runs from `outline-offset` to offset + width out from the
 * element's border edge, so it lies outside the element, over its border,
 * within it, or across these. Each part is judged against what it is painted
 * over: outside, the background colours of the element's ancestors (through
 * shadow hosts and frames); over a side's border, that border's colour, taken
 * as solid, over the element's own background colours; within the border, the
 * element's own background colours alone. Each background colour is taken to
 * lie under the whole outline — background-clip and the edges of the boxes
 * behind it are not read — so an outline over a background clipped to its
 * padding or content box, or one that ends before the outline does, is judged
 * against a colour not painted there. The lowest contrast counts. Colours are
 * composited in a canvas — every background colour from the first opaque one
 * up, then a border colour where one lies under the part, then the outline — so
 * the browser resolves any CSS colour form (rgb, oklch, color-mix) and any
 * alpha to what it paints, and a transparent outline scores 1:1.
 */
export async function focusStops(page: Page): Promise<FocusStop[]> {
  const limit = await elementCount(page);
  const left = (): Promise<boolean> =>
    page.evaluate(
      () => document.activeElement === null || document.activeElement === document.body,
    );
  // From the top: Tab past whatever has focus once the page has loaded until focus
  // leaves the page, so the next press reaches its first stop.
  for (let press = 0; !(await left()); press++) {
    if (press === limit) throw new Error(`Focus did not leave the page within ${limit} presses.`);
    await page.keyboard.press('Tab');
  }
  // When the walk reached each element, held in the page only through this handle,
  // so nothing the page declares can collide with it.
  const visits = await page.evaluateHandle(() => new Map<Element, number>());
  const stops: FocusStop[] = [];
  for (let step = 1; step <= limit; step++) {
    await page.keyboard.press('Tab');
    const reached = await page.evaluate(
      ({ press, reachedAt }): Reached => {
        /** The element that has focus, inside any open shadow root or same-origin frame. */
        const focused = (node: Element): Element => {
          // Read without instanceof, which a frame's own window would fail.
          const frame =
            'contentDocument' in node ? (node as HTMLIFrameElement).contentDocument : null;
          const inner =
            node.shadowRoot?.activeElement ??
            (frame !== null && frame.activeElement !== frame.body ? frame.activeElement : null);
          return inner === null ? node : focused(inner);
        };
        const top = document.activeElement;
        if (top === null || top === document.body) return { kind: 'end' };
        const element = focused(top);
        const label = `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`;
        const seen = reachedAt.get(element);
        reachedAt.set(element, press);
        if (seen === press - 1) return { kind: 'part' };
        if (seen !== undefined) return { kind: 'trap', element: label };

        const context = document
          .createElement('canvas')
          .getContext('2d', { willReadFrequently: true });
        if (context === null) throw new Error('no 2D canvas to composite colours with');
        const pixel = (): number[] => [...context.getImageData(0, 0, 1, 1).data];
        const alphaOf = (color: string): number => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return (pixel()[3] ?? 0) / 255;
        };
        // Each colour over the last, on the white the page itself is painted on.
        const paint = (colors: readonly string[]): number[] => {
          for (const color of ['white', ...colors]) {
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
          }
          return pixel();
        };
        const luminance = ([r, g, b]: number[]): number => {
          const linear = (channel = 0): number => {
            const c = channel / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
        };
        const styleOf = (node: Element): CSSStyleDeclaration =>
          (node.ownerDocument.defaultView ?? window).getComputedStyle(node);
        /** What a node is painted inside: its slot, its parent, the host of the shadow root it tops, or its frame. */
        const up = (node: Element): Element | null => {
          const parent = node.parentNode;
          const host = parent !== null && 'host' in parent ? (parent as ShadowRoot).host : null;
          return (
            node.assignedSlot ??
            node.parentElement ??
            host ??
            node.ownerDocument.defaultView?.frameElement ??
            null
          );
        };
        /** The background colours from `start` up to the first opaque one, lowest first. */
        const backgroundsFrom = (start: Element | null): string[] => {
          const colors: string[] = [];
          for (let node = start; node !== null; node = up(node)) {
            const color = styleOf(node).backgroundColor;
            colors.unshift(color);
            if (alphaOf(color) === 1) break;
          }
          return colors;
        };
        const style = styleOf(element);
        const contrastOver = (backgrounds: string[]): number => {
          const [lighter = 0, darker = 0] = [
            luminance(paint([...backgrounds, style.outlineColor])),
            luminance(paint(backgrounds)),
          ].sort((a, b) => b - a);
          return (lighter + 0.05) / (darker + 0.05);
        };
        const width = Number.parseFloat(style.outlineWidth);
        const offset = Number.parseFloat(style.outlineOffset);
        const inside = backgroundsFrom(element);
        const borders = (['top', 'right', 'bottom', 'left'] as const).map((side) => ({
          width: Number.parseFloat(style.getPropertyValue(`border-${side}-width`)),
          color: style.getPropertyValue(`border-${side}-color`),
        }));
        const contrasts = [
          ...(offset + width > 0 ? [contrastOver(backgroundsFrom(up(element)))] : []),
          ...borders
            .filter((border) => border.width > 0 && offset < 0 && offset + width > -border.width)
            .map((border) => contrastOver([...inside, border.color])),
          ...(borders.some((border) => offset < -border.width) ? [contrastOver(inside)] : []),
        ];
        return {
          kind: 'stop',
          stop: {
            element: label,
            outlineStyle: style.outlineStyle,
            outlineWidth: width,
            // An outline with no width paints nothing.
            contrast: contrasts.length === 0 ? 1 : Math.min(...contrasts),
          },
        };
      },
      { press: step, reachedAt: visits },
    );
    if (reached.kind === 'end') return stops;
    if (reached.kind === 'trap') {
      throw new Error(
        `Tab came back to ${reached.element} before focus left the page: a keyboard trap`,
      );
    }
    if (reached.kind === 'stop') stops.push(reached.stop);
  }
  throw new Error(`Focus did not leave the page within ${limit} presses.`);
}
