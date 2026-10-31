import type { Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { RADIO_OPTIONS } from './dom-selectors';
import { readElementFacts } from './element-facts';

/**
 * A radio group's option chosen as a person chooses it. The option is found
 * by the words an observation reads on it — never by its name alone, which a
 * form may give every option of a question — and clicked where a person's
 * click on it lands: the radio itself when it takes the click, else whatever
 * the page draws at the point a person aims at, inside the group. A click
 * that lands beside the radio is read back: the radio reads as chosen within
 * the declared wait, or the select failed, saying what the field then held.
 * Measured 2026-10-31: a job site's native radios were named after their
 * question and took no click of their own — the snapshot gave them no ref —
 * so checking the one asked for waited out the action timeout, and the
 * operator chose in the browser.
 */
export async function chooseRadio(group: Locator, words: string, waitMs: number): Promise<void> {
  const facts = await readElementFacts(group);
  const at = facts?.radioWords?.indexOf(words) ?? -1;
  if (at < 0) throw new ActionFailed('select', noSuchOption(words, facts?.options ?? null));
  const radio = group.locator(RADIO_OPTIONS).nth(at);
  const aimed = await radio.evaluateHandle(clickLandsOnInPage);
  const landing = aimed.asElement();
  try {
    if (landing === null || (await radio.evaluate(isOrHolds, landing))) {
      await radio.check();
      return;
    }
    await landing.click();
  } finally {
    await aimed.dispose();
  }
  await readBack(group, radio, words, waitMs);
}

/** After a click beside the radio: it reads as chosen within the wait, or the select failed. */
async function readBack(
  group: Locator,
  radio: Locator,
  words: string,
  waitMs: number,
): Promise<void> {
  const control = await radio.elementHandle();
  try {
    await group.page().waitForFunction(checkedInPage, control, { timeout: waitMs, polling: 'raf' });
    return;
  } catch {
    // Not chosen within the wait: said below, by what the field holds.
  } finally {
    await control.dispose();
  }
  const held = (await readElementFacts(group))?.value ?? null;
  throw new ActionFailed(
    'select',
    `clicked the option ${JSON.stringify(words)}, and the field then held ${
      held === null ? 'nothing' : JSON.stringify(held)
    }`,
  );
}

/** Why no option was chosen, in the words the next plan reads: what was asked for, and what the group offers. */
const noSuchOption = (words: string, offered: readonly string[] | null): string =>
  `no option reads ${JSON.stringify(words)}: ${
    offered === null || offered.length === 0
      ? 'the field offers none'
      : `the field offers ${offered.map((option) => JSON.stringify(option)).join(', ')}`
  } — answer it with one of its options' exact words`;

/** Whether the click lands on the radio itself or on what it holds. */
const isOrHolds = (radio: Element, landing: Element): boolean =>
  radio === landing || radio.contains(landing);

/**
 * In the page: where a person's click on the radio lands — the topmost
 * element at the middle of the radio's box, or, for a radio drawn with no box
 * of its own, of the nearest box around it — when that is inside the radio's
 * group; else the radio itself, so a click covered by something outside the
 * group fails as Playwright says it does. One function on purpose: Playwright
 * serialises it whole.
 */
function clickLandsOnInPage(radio: Element): Element {
  let aimed: Element | null = radio;
  while (aimed !== null) {
    const box = aimed.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) break;
    aimed = aimed.parentElement;
  }
  const group = radio.closest('[role="radiogroup"]');
  if (aimed === null || group === null) return radio;
  aimed.scrollIntoView({ block: 'center', inline: 'center' });
  const box = aimed.getBoundingClientRect();
  const landing = radio.ownerDocument.elementFromPoint(
    box.left + box.width / 2,
    box.top + box.height / 2,
  );
  return landing !== null && group.contains(landing) ? landing : radio;
}

/** In the page: whether the radio reads as chosen — by its ARIA state, its own, or that of the native radio drawn inside it. */
function checkedInPage(radio: Element): boolean {
  return (
    radio.getAttribute('aria-checked') === 'true' ||
    (radio as HTMLInputElement).checked === true ||
    radio.querySelector('input[type="radio"]:checked') !== null
  );
}
