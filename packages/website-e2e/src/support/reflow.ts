import type { Page } from '@playwright/test';

/** What of a page reaches past the viewport's right edge. */
interface Overflow {
  /** How far the page scrolls sideways, in CSS px. */
  scroll: number;
  /** Each element or line of text that ends past the edge, and each element whose content does. */
  past: string[];
}

/**
 * Whether anything on a page ends past the viewport's right edge, even where an
 * overflow clip hides it. Every element and line of text in the document is
 * measured as drawn, fixed-position boxes among them, and so is every element's
 * scrolling area when its content is wider than its box, which also counts what
 * the walk cannot reach, such as generated content and shadow trees. A scaled
 * element's scrolling area is measured at its scale. Not seen: content clipped
 * by a clip the walk cannot reach (inside a shadow tree, or a generated box's
 * own), a fixed-position box the walk cannot reach (generated, in a shadow
 * tree, or inside a visually hidden box), and, since no transform but a scale
 * is mapped, content the walk cannot reach inside a rotated or skewed element.
 * An element whose own box is at most a pixel each way and clips its content
 * (the visually hidden pattern) shows none of it, so its content is not walked;
 * one with no box of its own (`display: contents`) is walked.
 */
export const overflowPastRightEdge = (page: Page): Promise<Overflow> =>
  page.evaluate(() => {
    const root = document.documentElement;
    const edge = root.clientWidth + 0.5;
    const showsNothing = (element: Element): boolean => {
      const { width, height } = element.getBoundingClientRect();
      return (
        element.getClientRects().length > 0 &&
        getComputedStyle(element).overflowX !== 'visible' &&
        width <= 1 &&
        height <= 1
      );
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node instanceof Element && showsNothing(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const rectsOf = (node: Node): DOMRect[] => {
      if (node instanceof Element) return [node.getBoundingClientRect()];
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()];
    };
    /** Where an element's content ends, if it is wider than the element's box. */
    const contentEnd = (element: Element): number | null => {
      if (element.scrollWidth <= element.clientWidth) return null;
      const box = element.getBoundingClientRect();
      const drawn = element instanceof HTMLElement ? element.offsetWidth : box.width;
      const scale = drawn === 0 || Math.abs(box.width - drawn) < 1 ? 1 : box.width / drawn;
      return box.left + (element.clientLeft + element.scrollWidth) * scale;
    };
    const past: string[] = [];
    // A TreeWalker never returns its root, so the root is measured first.
    for (let node: Node | null = root; node !== null; node = walker.nextNode()) {
      if (
        rectsOf(node).some(({ width, height, right }) => width > 0 && height > 0 && right > edge)
      ) {
        past.push(node instanceof Element ? node.tagName : `"${node.textContent?.trim()}"`);
      }
      if (node instanceof Element) {
        const end = contentEnd(node);
        if (end !== null && end > edge) past.push(`${node.tagName} content`);
      }
    }
    return { scroll: root.scrollWidth - root.clientWidth, past };
  });
