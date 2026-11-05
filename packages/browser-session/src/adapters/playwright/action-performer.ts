/**
 * One browser action carried out on the page, against the element the last
 * observation listed under its ref. Nothing here decides what to do: the
 * action is the plan's, and the adapter only does it.
 */
import { choosesByTyping, type ObservedElement } from '@sysdesign/contracts';
import type { Locator, Page } from 'playwright';

import type { BrowserAction } from '../../core/ports';
import { GROUP_OPTIONS, type ChoiceBox } from './name-groups';
import { chooseRadio, toggleCheckbox } from './radio-choice';
import { chooseByTyping } from './typed-choice';

/** What the performer acts through: the page in front, and the element under a ref. */
export interface ActionSurface {
  page: Page;
  locate(ref: string): Locator;
  /** The file supplied for a document the mission declares, by name; throws `ActionFailed` for a name nobody supplied. */
  documentPath(name: string): string;
  /** How far one page-level scroll moves, in CSS pixels. */
  scrollPx: number;
  /** How long a select waits for the page to show its choice: the option a typed control lists, or a radio clicked beside it reading as chosen. */
  optionWaitMs: number;
  /** How long a select waits between reads of a radio group it clicked beside, until the group reads as chosen. */
  settleRetryMs: number;
  /** The box the last observation listed in place of the choices it holds (`name-groups.ts`), or null. */
  choiceBoxOf(ref: string): ChoiceBox | null;
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
      // A checkbox the page drew takes a person's click where it shows, until it reads the other way.
      if (surface.choiceBoxOf(action.ref)?.drawn === true) {
        await toggleCheckbox(locate(action.ref), surface);
        return;
      }
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
 * A `<select>` takes the option by label; a group the page makes by name
 * alone chooses among the options its box holds; a radio group chooses the
 * radio whose words, as the observation read them, are the option's; a control
 * typed into types the option's words and chooses that option; anything else
 * opens and picks.
 */
async function select(
  { page, locate, optionWaitMs, settleRetryMs, choiceBoxOf }: ActionSurface,
  target: ObservedElement | null,
  ref: string,
  option: string,
): Promise<void> {
  const locator = locate(ref);
  if (target?.inputType === 'select') {
    await locator.selectOption({ label: option });
    return;
  }
  const box = choiceBoxOf(ref);
  if (box !== null && !box.drawn) {
    await chooseRadio(locator, option, { optionWaitMs, settleRetryMs }, GROUP_OPTIONS[box.kind]);
    return;
  }
  if (target?.role === 'radiogroup') {
    await chooseRadio(locator, option, { optionWaitMs, settleRetryMs });
    return;
  }
  if (target?.role === 'radio') {
    await locator.check();
    return;
  }
  if (target !== null && choosesByTyping(target.role, target)) {
    await chooseByTyping(locator, option, optionWaitMs);
    return;
  }
  await locator.click();
  await page.getByRole('option', { name: option, exact: true }).first().click();
}
