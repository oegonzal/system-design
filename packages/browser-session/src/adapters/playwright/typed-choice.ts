import type { Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { readElementFacts } from './element-facts';

/**
 * A control both typed into and chosen from — an input with the combobox
 * role — commits the way a person commits it: the option's words typed, then
 * the option whose words are exactly those chosen, from the lists the control
 * itself names. Never a list elsewhere on the page: a form measured on
 * 2026-10-30 carried fifteen such controls. Nothing is chosen when no such
 * option shows within the declared wait; the failure names what the control
 * offered for those words, so the next answer can be one of them verbatim.
 */
export async function chooseByTyping(
  locator: Locator,
  words: string,
  waitMs: number,
): Promise<void> {
  await locator.fill(words);
  const control = await locator.elementHandle();
  if (control === null) throw new ActionFailed('select', 'the field is gone from the page');
  let found: ExactOption | false = false;
  try {
    const handle = await locator
      .page()
      .waitForFunction(exactOptionInPage, { control, words }, { timeout: waitMs, polling: 'raf' });
    found = await handle.jsonValue();
  } catch {
    // No such option within the wait: said below, by what the control offered.
  } finally {
    await control.dispose();
  }
  if (found === false) {
    const offered = (await readElementFacts(locator))?.options ?? null;
    throw new ActionFailed('select', noChoice(words, offered));
  }
  await locator
    .page()
    .locator(`[id="${found.list.replace(/["\\]/g, '\\$&')}"] [role="option"]`)
    .nth(found.at)
    .click();
}

/** Where the option a select chooses sits: the list's id, and its place among that list's options. */
interface ExactOption {
  list: string;
  at: number;
}

/** Why nothing was chosen, in the words the next plan reads: what was typed, and what the control offered for it. */
const noChoice = (words: string, offered: readonly string[] | null): string =>
  `typed ${JSON.stringify(words)}: ${
    offered === null || offered.length === 0
      ? 'the field offered nothing for those words'
      : `the field offered ${offered.map((option) => JSON.stringify(option)).join(', ')}`
  } — answer it with one of its options' exact words`;

/**
 * In the page: the first enabled option, in the lists the control names,
 * whose words — whitespace collapsed and trimmed, case kept — are exactly the
 * words typed. One function on purpose: Playwright serialises it whole.
 */
function exactOptionInPage({
  control,
  words,
}: {
  control: Element;
  words: string;
}): ExactOption | false {
  const tidy = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();
  const wanted = tidy(words);
  const ids = (control.getAttribute('aria-controls') ?? control.getAttribute('aria-owns') ?? '')
    .split(/\s+/)
    .filter((id) => id.length > 0);
  for (const id of ids) {
    const list = control.ownerDocument.getElementById(id);
    if (list === null) continue;
    const at = Array.from(list.querySelectorAll('[role="option"]')).findIndex(
      (option) =>
        option.getAttribute('aria-disabled') !== 'true' && tidy(option.textContent) === wanted,
    );
    if (at >= 0) return { list: id, at };
  }
  return false;
}
