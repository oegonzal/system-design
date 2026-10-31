import type { Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { RADIO_OPTIONS } from './dom-selectors';
import { offeredNote } from './playwright-errors';
import { aimAtOption, answerable, readRadioGroup, type RadioGroupReading } from './radio-group';

/** How a select on a radio group waits on the page: for the choice to show, and between reads of it. */
interface RadioWaits {
  optionWaitMs: number;
  settleRetryMs: number;
}

/**
 * A radio group's option chosen as a person chooses it: the one option the
 * observation offers whose words are the option's — never one the page
 * disables, and none at all when two read alike — clicked where a person's
 * click on it lands (`radio-group.ts`). A radio that takes the click itself
 * is Playwright's check, which reads the choice back itself. Otherwise each
 * point a person tries — its labels, the box drawn around it, the marks
 * beside it, its row, its words — is clicked in turn until the group reads
 * the option as chosen; then the group is read again until the declared wait
 * ends. Each read is of the option at the place the words were read at, and
 * still of those words. Measured 2026-10-31: a job site's native radios were
 * named after their question and took no click of their own, so checking the
 * one asked for waited out the action timeout, and the operator chose in the
 * browser.
 */
export async function chooseRadio(group: Locator, words: string, waits: RadioWaits): Promise<void> {
  const reading = await readRadioGroup(group);
  if (reading === null) throw new ActionFailed('select', 'the field could not be read');
  const offered = answerable(reading);
  const matching = offered.filter((option) => option.words === words);
  const [option] = matching;
  if (option === undefined) {
    const note = offeredNote(offered.map((each) => each.words));
    throw new ActionFailed('select', `no option reads ${JSON.stringify(words)}: ${note}`);
  }
  if (matching.length > 1) {
    throw new ActionFailed(
      'select',
      `${matching.length} options read ${JSON.stringify(words)} — the field cannot tell them apart`,
    );
  }
  const at = reading.options.indexOf(option);
  const aimed = await aimAtOption(group, at);
  if (aimed?.options[at]?.words !== words) {
    throw new ActionFailed(
      'select',
      `the field changed before ${JSON.stringify(words)} was chosen`,
    );
  }
  const [first] = aimed.aims;
  if (first === undefined) {
    throw new ActionFailed(
      'select',
      `the option ${JSON.stringify(words)} shows nowhere a click would reach it`,
    );
  }
  if (first.self) {
    await group.locator(RADIO_OPTIONS).nth(at).check();
    return;
  }
  for (const aim of aimed.aims) {
    await group.page().mouse.click(aim.x, aim.y);
    if (chosen(await readRadioGroup(group), at, words)) return;
  }
  await readBack(group, at, words, waits);
}

/** Whether the group reads the option at `at`, still of those words, as chosen. */
const chosen = (reading: RadioGroupReading | null, at: number, words: string): boolean =>
  reading?.options[at]?.words === words && reading.options[at]?.checked === true;

/** After the clicks: the group reads the option as chosen within the wait, or the select failed, saying what the field holds. */
async function readBack(
  group: Locator,
  at: number,
  words: string,
  { optionWaitMs, settleRetryMs }: RadioWaits,
): Promise<void> {
  const until = Date.now() + optionWaitMs;
  let reading = await readRadioGroup(group);
  while (!chosen(reading, at, words) && Date.now() < until) {
    await group.page().waitForTimeout(settleRetryMs);
    reading = await readRadioGroup(group);
  }
  if (chosen(reading, at, words)) return;
  const held = reading?.options.find((each) => each.checked)?.words ?? null;
  throw new ActionFailed(
    'select',
    `clicked the option ${JSON.stringify(words)}, and the field then held ${
      held === null ? 'nothing' : JSON.stringify(held)
    }`,
  );
}
