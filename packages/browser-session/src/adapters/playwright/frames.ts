import type { Frame, Locator } from 'playwright';

/** A point in a frame's own coordinates, or in the page's. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Where an element is drawn: the frame that holds it — a form a page embeds
 * is a document of its own, often from another origin, where its lists are
 * looked for and its choices read — and where that frame's content sits on
 * the page, which turns a point read in the frame into one the page's mouse
 * clicks. The page's own frame sits at its origin.
 */
export interface Place {
  frame: Frame;
  offset: Point;
}

export async function placeOf(locator: Locator): Promise<Place> {
  const handle = await locator.elementHandle();
  try {
    const frame = (await handle.ownerFrame()) ?? locator.page().mainFrame();
    if (frame.parentFrame() === null) return { frame, offset: { x: 0, y: 0 } };
    const element = await frame.frameElement();
    const box = await element.boundingBox();
    // The frame's content starts inside its border and padding.
    const inset = await element.evaluate((el: Element) => {
      const style = getComputedStyle(el);
      return {
        x: el.clientLeft + parseFloat(style.paddingLeft),
        y: el.clientTop + parseFloat(style.paddingTop),
      };
    });
    return { frame, offset: { x: (box?.x ?? 0) + inset.x, y: (box?.y ?? 0) + inset.y } };
  } finally {
    await handle.dispose();
  }
}

/** A point read in the frame, as the page's mouse clicks it. */
export const onPage = (place: Place, point: Point): Point => ({
  x: place.offset.x + point.x,
  y: place.offset.y + point.y,
});
