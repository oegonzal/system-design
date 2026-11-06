import type { Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { CHECKBOX_OPTIONS, RADIO_OPTIONS } from './dom-selectors';
import { offeredNote } from './playwright-errors';
import {
  aimAtOption,
  answerable,
  readRadioGroup,
  type GroupOptions,
  type RadioGroupReading,
} from './radio-group';

/** How a select on a radio group waits on the page: for the choice to show, and between reads of it. */
interface RadioWaits {
  optionWaitMs: number;
  settleRetryMs: number;
}

/**
 * A group's option chosen as a person chooses it — a radio group's, or a
 * group of checkboxes read the same way: the one option the observation
 * offers whose words are the option's — never one the page disables, and
 * none at all when two read alike — clicked where a person's click on it
 * lands (`radio-group.ts`); one chosen already is left as it is, since a
 * click on a checkbox would take it back out. A radio that takes the click itself
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
export async function chooseRadio(
  group: Locator,
  words: string,
  waits: RadioWaits,
  options: GroupOptions = RADIO_OPTIONS,
): Promise<void> {
  const reading = await readRadioGroup(group, undefined, options);
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
  // Chosen already: a click would only take a checkbox back out of the answer.
  if (option.checked) return;
  const aimed = await aimAtOption(group, at, options);
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
    await group.locator(options).nth(at).check();
    return;
  }
  for (const aim of aimed.aims) {
    await group.page().mouse.click(aim.x, aim.y);
    if (chosen(await readRadioGroup(group, undefined, options), at, words)) return;
  }
  await readBack(group, at, words, waits, options);
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
  options: GroupOptions,
): Promise<void> {
  const until = Date.now() + optionWaitMs;
  let reading = await readRadioGroup(group, undefined, options);
  while (!chosen(reading, at, words) && Date.now() < until) {
    await group.page().waitForTimeout(settleRetryMs);
    reading = await readRadioGroup(group, undefined, options);
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

/**
 * A checkbox its page drew, turned the other way as a person turns it: read,
 * then clicked where a person's click on it lands — the checkbox itself when
 * it takes the click, else its labels, the box drawn around it, the marks
 * beside it, its box, its words (`radio-group.ts`) — one point at a time,
 * each given the declared settle to show the change before the next is
 * tried, so a click that took is never undone by another. Fails, naming what
 * it holds, when no point shows or none turns it.
 */
export async function toggleCheckbox(
  box: Locator,
  { optionWaitMs, settleRetryMs }: RadioWaits,
): Promise<void> {
  const holds = async (): Promise<boolean | null> =>
    (await readRadioGroup(box, undefined, CHECKBOX_OPTIONS))?.options[0]?.checked ?? null;
  const was = await holds();
  if (was === null) throw new ActionFailed('click', 'the checkbox could not be read');
  // Turned only when it reads the other way: a read that fails says nothing turned.
  const turned = async (): Promise<boolean> => (await holds()) === !was;
  const aimed = await aimAtOption(box, 0, CHECKBOX_OPTIONS);
  const [first] = aimed?.aims ?? [];
  if (first === undefined) {
    throw new ActionFailed('click', 'the checkbox shows nowhere a click would reach it');
  }
  if (first.self) {
    await box.locator(CHECKBOX_OPTIONS).first().setChecked(!was);
    return;
  }
  for (const aim of aimed?.aims ?? []) {
    await box.page().mouse.click(aim.x, aim.y);
    if (await turned()) return;
    await box.page().waitForTimeout(settleRetryMs);
    if (await turned()) return;
  }
  const until = Date.now() + optionWaitMs;
  while (Date.now() < until) {
    await box.page().waitForTimeout(settleRetryMs);
    if (await turned()) return;
  }
  throw new ActionFailed(
    'click',
    `clicked the checkbox, and it still reads ${was ? 'checked' : 'unchecked'}`,
  );
}
