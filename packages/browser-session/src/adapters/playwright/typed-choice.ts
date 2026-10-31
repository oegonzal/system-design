import { escapeRegExp } from '@sysdesign/contracts';
import type { Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { readElementFacts } from './element-facts';

/** Words an element shows whole, around its own whitespace — never a longer text they begin. */
export const wholeText = (words: string): RegExp => new RegExp(`^\\s*${escapeRegExp(words)}\\s*$`);

/**
 * A control both typed into and chosen from — an input with the combobox
 * role — commits the way a person commits it: the option's words typed, then
 * the option whose words are exactly those chosen, from the lists the control
 * itself names. Never a list elsewhere on the page: a form measured on
 * 2026-10-30 carried fifteen such controls. The option is clicked by its
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
  await locator.fill(words);
  const control = await locator.elementHandle();
  let list: string | false = false;
  try {
    const handle = await locator
      .page()
      .waitForFunction(
        listWithExactOptionInPage,
        { control, words },
        { timeout: waitMs, polling: 'raf' },
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
    throw new ActionFailed('select', noChoice(words, offered));
  }
  await locator
    .page()
    .locator(`[id="${list.replace(/["\\]/g, '\\$&')}"] [role="option"]:not([aria-disabled="true"])`)
    .filter({ hasText: wholeText(words) })
    .first()
    .click();
}

/** Whether the control names a list of its own — `aria-controls`, else `aria-owns` — as one whose choices commit does. */
const namesAList = (locator: Locator): Promise<boolean> =>
  locator.evaluate(
    (el) => (el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns') ?? '').trim() !== '',
  );

/** Why nothing was chosen, in the words the next plan reads: what was typed, and what the control offered for it. */
const noChoice = (words: string, offered: readonly string[] | null): string =>
  `typed ${JSON.stringify(words)}: ${
    offered === null || offered.length === 0
      ? 'the field offered nothing for those words'
      : `the field offered ${offered.map((option) => JSON.stringify(option)).join(', ')}`
  } — answer it with one of its options' exact words`;

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
