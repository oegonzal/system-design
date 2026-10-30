/**
 * One browser action carried out on the page, against the element the last
 * observation listed under its ref. Nothing here decides what to do: the
 * action is the plan's, and the adapter only does it.
 */
import { escapeRegExp, type ObservedElement } from '@sysdesign/contracts';
import type { Locator, Page } from 'playwright';

import type { BrowserAction } from '../../core/ports';

/** Words an element shows whole, around its own whitespace — never a longer text they begin. */
const wholeText = (words: string): RegExp => new RegExp(`^\\s*${escapeRegExp(words)}\\s*$`);

/** What the performer acts through: the page in front, and the element under a ref. */
export interface ActionSurface {
  page: Page;
  locate(ref: string): Locator;
  /** The file supplied for a document the mission declares, by name; throws `ActionFailed` for a name nobody supplied. */
  documentPath(name: string): string;
  /** How far one page-level scroll moves, in CSS pixels. */
  scrollPx: number;
}

export async function performAction(
  surface: ActionSurface,
  action: BrowserAction,
  target: ObservedElement | null,
): Promise<void> {
  const { page, locate } = surface;
  switch (action.kind) {
    case 'navigate':
      await page.goto(action.url, { waitUntil: 'domcontentloaded' });
      return;
    case 'click':
      await locate(action.ref).click();
      return;
    case 'fill':
      await locate(action.ref).fill(action.value);
      return;
    case 'select':
      await select(surface, target, action.ref, action.option);
      return;
    case 'upload':
      // Set, never clicked: the chooser a click would open is the browser's, and the setter needs no sight.
      await locate(action.ref).setInputFiles(surface.documentPath(action.document));
      return;
    case 'press':
      await page.keyboard.press(action.key === 'Space' ? ' ' : action.key);
      return;
    case 'scroll':
      if (action.ref === null) {
        await page.mouse.wheel(
          0,
          action.direction === 'down' ? surface.scrollPx : -surface.scrollPx,
        );
      } else {
        await locate(action.ref).scrollIntoViewIfNeeded();
      }
      return;
    case 'waitFor':
      if (action.until === 'url') {
        await page.waitForURL((url) => url.href.includes(action.value));
      } else if (action.until === 'text') {
        await page.getByText(action.value).first().waitFor({ state: 'visible' });
      } else {
        await locate(action.value).waitFor({ state: 'visible' });
      }
      return;
  }
}

/**
 * A `<select>` takes the option by label; a radio group checks the radio
 * its option names — by its accessible name when that names one radio, else
 * by the words it shows, as the observation read its options; anything else
 * opens and picks.
 */
async function select(
  { page, locate }: ActionSurface,
  target: ObservedElement | null,
  ref: string,
  option: string,
): Promise<void> {
  const locator = locate(ref);
  if (target?.inputType === 'select') {
    await locator.selectOption({ label: option });
    return;
  }
  if (target?.role === 'radiogroup') {
    const named = locator.getByRole('radio', { name: option, exact: true });
    const radio =
      (await named.count()) === 1
        ? named
        : locator.getByRole('radio').filter({ hasText: wholeText(option) });
    await radio.first().check();
    return;
  }
  if (target?.role === 'radio') {
    await locator.check();
    return;
  }
  await locator.click();
  await page.getByRole('option', { name: option, exact: true }).first().click();
}
