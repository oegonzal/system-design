import { escapeRegExp } from '@sysdesign/contracts';
import type { Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { readElementFacts } from './element-facts';
import { placeOf } from './frames';
import { offeredNote } from './playwright-errors';

/**
 * How often a wait in the page looks again. An interval, never animation
 * frames: a headed window another window covers gets its frames throttled,
 * and a wait polled on them would see no list at all.
 */
const POLL_MS = 50;

/** Words an element shows whole, around its own whitespace — never a longer text they begin. */
const wholeText = (words: string): RegExp => new RegExp(`^\\s*${escapeRegExp(words)}\\s*$`);

/**
 * A control both typed into and chosen from — an input with the combobox
 * role — commits the way a person commits it: the option's words typed key by
 * key, then the option whose words are exactly those chosen, from the lists
 * the control itself names (`typeWords`): measured 2026-11-06, one form's
 * lists stayed shut for words set whole and opened for the same words typed. Never a list elsewhere on the page: a form
 * measured on 2026-10-30 carried fifteen such controls. The option is clicked by its
 * words, never by its place, so a list that renders again between the find
 * and the click still gets the option asked for. A control naming no list of
 * its own declares no choices, and the words typed stand, as a fill's do. One
 * that names a list with no such option within the declared wait chooses
 * nothing, and the failure names what it offered for those words, so the next
 * answer can be one of them verbatim.
 */
export async function chooseByTyping(
  locator: Locator,
  words: string,
  waitMs: number,
): Promise<void> {
  await typeWords(locator, words, waitMs);
  // The control's own frame: a form embedded in a page keeps its lists there.
  const { frame } = await placeOf(locator);
  const control = await locator.elementHandle();
  let list: string | false = false;
  try {
    const handle = await frame.waitForFunction(
      listWithExactOptionInPage,
      { control, words },
      { timeout: waitMs, polling: POLL_MS },
    );
    list = await handle.jsonValue();
  } catch {
    // No such option within the wait: said below, by what the control offered.
  } finally {
    await control.dispose();
  }
  if (list === false) {
    if (!(await namesAList(locator))) return;
    const offered = (await readElementFacts(locator))?.options ?? null;
    throw new ActionFailed('select', `typed ${JSON.stringify(words)}: ${offeredNote(offered)}`);
  }
  await frame
    .locator(`[id="${list.replace(/["\\]/g, '\\$&')}"] [role="option"]:not([aria-disabled="true"])`)
    .filter({ hasText: wholeText(words) })
    .first()
    .click();
}

/**
 * The words typed as a person types them into the control: a click into it
 * first, which opens a list that opens on a click; the words it already holds
 * selected, so the first key replaces them — an empty control is sent no key
 * that clears it, since a Delete there removes the choices some widgets hold
 * beside their input or clears the one they show (a review reproduced both,
 * 2026-11-06); the first character pressed as a key, which opens a list that
 * opens only on a key; and the rest inserted as text, which no key handler
 * reads as a separator or a submit.
 */
async function typeWords(locator: Locator, words: string, waitMs: number): Promise<void> {
  await locator.click({ timeout: waitMs }).catch(() => locator.focus());
  if ((await locator.inputValue()) !== '') await locator.selectText();
  const [first = '', ...rest] = Array.from(words);
  if (first !== '') await locator.pressSequentially(first);
  if (rest.length > 0) await locator.page().keyboard.insertText(rest.join(''));
}

/** Whether the control names a list of its own — `aria-controls`, else `aria-owns` — as one whose choices commit does. */
const namesAList = (locator: Locator): Promise<boolean> =>
  locator.evaluate(
    (el) => (el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns') ?? '').trim() !== '',
  );

/**
 * In the page: the id of the first list the control names whose enabled
 * options include one whose words — whitespace collapsed and trimmed, case
 * kept — are exactly the words typed. One function on purpose: Playwright
 * serialises it whole.
 */
function listWithExactOptionInPage({
  control,
  words,
}: {
  control: Element;
  words: string;
}): string | false {
  const tidy = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();
  const wanted = tidy(words);
  const ids = (control.getAttribute('aria-controls') ?? control.getAttribute('aria-owns') ?? '')
    .split(/\s+/)
    .filter((id) => id.length > 0);
  for (const id of ids) {
    const list = control.ownerDocument.getElementById(id);
    if (list === null) continue;
    const found = Array.from(list.querySelectorAll('[role="option"]')).some(
      (option) =>
        option.getAttribute('aria-disabled') !== 'true' && tidy(option.textContent) === wanted,
    );
    if (found) return id;
  }
  return false;
}

/**
 * The options a control typed into and chosen from offers with nothing
 * typed: its list opened the way a person opens it — a click into the
 * control — its enabled options read from the lists the control names once
 * open, then the list closed with Escape, leaving the control as it was.
 * Measured 2026-11-06 on two forms' widgets: a click opened each such list
 * whole (244, 78 and 254 options, the one a form's answer named among them)
 * and Escape closed each with the control still empty. Null when the control
 * opens no list of its own within the wait, or its list shows no option.
 */
export async function readTypedChoices(locator: Locator, waitMs: number): Promise<string[] | null> {
  await locator.click();
  const { frame } = await placeOf(locator);
  const control = await locator.elementHandle();
  try {
    const handle = await frame.waitForFunction(optionsInPage, control, {
      timeout: waitMs,
      polling: POLL_MS,
    });
    const options = await handle.jsonValue();
    return options === false ? null : options;
  } catch {
    return null;
  } finally {
    await control.dispose();
    await locator.press('Escape').catch(() => undefined);
  }
}

/** In the page: the words of the enabled options in the lists the control names, or false while there are none. */
function optionsInPage(control: Element): string[] | false {
  const tidy = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();
  const words = (control.getAttribute('aria-controls') ?? control.getAttribute('aria-owns') ?? '')
    .split(/\s+/)
    .filter((id) => id.length > 0)
    .flatMap((id) => {
      const list = control.ownerDocument.getElementById(id);
      return list === null ? [] : Array.from(list.querySelectorAll('[role="option"]'));
    })
    .filter((option) => option.getAttribute('aria-disabled') !== 'true')
    .map((option) => tidy(option.textContent))
    .filter((text) => text !== '');
  return words.length > 0 ? words : false;
}
