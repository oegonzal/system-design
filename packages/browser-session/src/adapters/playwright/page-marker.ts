/**
 * The page imaged with one element marked while the image is taken, and never
 * after: the mark is an attribute an injected style outlines, apart from the
 * operator highlight's, which stays on a field once it was asked about and
 * would otherwise make every such field read as the one just entered.
 */
import type { Locator, Page } from 'playwright';

/** The attribute an element carries while its capture is taken, and never after. */
const CAPTURE_MARK = 'data-session-capture';
const CAPTURE_STYLE = `[${CAPTURE_MARK}] { outline: 3px solid #2563eb !important; outline-offset: 2px !important; }`;
/** How long marking an element may take: an image documents, and an element that is gone is not worth a wait. */
const MARK_TIMEOUT_MS = 1_000;

/** The element marked for a capture; null when it cannot be — gone, or never located. */
async function mark(locate: () => Locator): Promise<Locator | null> {
  try {
    const locator = locate();
    await locator.evaluate((el, name) => el.setAttribute(name, ''), CAPTURE_MARK, {
      timeout: MARK_TIMEOUT_MS,
    });
    return locator;
  } catch {
    return null;
  }
}

/**
 * The page at CSS scale — legible, and a quarter of a retina screen's pixels —
 * with the element `locate` finds marked while it is taken; unmarked when
 * `locate` is null.
 */
export async function markedScreenshot(
  page: Page,
  locate: (() => Locator) | null,
): Promise<Uint8Array> {
  const marked = locate === null ? null : await mark(locate);
  try {
    return new Uint8Array(
      await page.screenshot({ type: 'png', scale: 'css', style: CAPTURE_STYLE }),
    );
  } finally {
    await marked
      ?.evaluate((el, name) => el.removeAttribute(name), CAPTURE_MARK, { timeout: MARK_TIMEOUT_MS })
      .catch(() => undefined);
  }
}
