import type { Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { CHECKBOX_OPTIONS, RADIO_OPTIONS } from './dom-selectors';
import { onPage, placeOf, type Place, type Point } from './frames';
import { offeredNote } from './playwright-errors';
import {
  aimAtOption,
  answerable,
  readChoiceAt,
  readRadioGroup,
  type GroupOptions,
  type RadioGroupReading,
} from './radio-group';

/**
 * Whether the page answered a click by drawing what was clicked anew: the box
 * read before the click has left the page. What it holds now is the choice
 * drawn where the click landed (`readChoiceAt`), never the box that left — a
 * further click on a choice that took would land on the new drawing and, on a
 * checkbox, turn it back. Measured 2026-11-06: an application form drew its
 * "Yes" box again, ticked, under new refs; the session read the box it had
 * clicked, saw it unticked, clicked the other points of it, and the step
 * failed with the box left as the last click happened to leave it.
 */
const drawnAnew = async (box: Locator): Promise<boolean> =>
  // A box whose frame is gone cannot be counted: it has left the page as surely.
  (await box.count().catch(() => 0)) === 0;

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
 * is clicked there, and the group read back. Otherwise each
 * point a person tries — its labels, the box drawn around it, the marks
 * beside it, its row, its words — is clicked in turn until the group reads
 * the option as chosen; then the group is read again until the declared wait
 * ends. Each read is of the option at the place the words were read at, and
 * still of those words; a group the page drew anew after a click is read where
 * the click landed (`readChoiceAt`), and the next point tried when it reads
 * unchosen there. Measured 2026-10-31: a job site's native radios were
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
  // Its points are read in its own frame, found before any click can draw it anew; the page's mouse clicks them where that frame sits.
  const place = await placeOf(group);
  if (first.self) {
    await group.locator(options).nth(at).click();
    await readBack(group, at, words, { place, last: first }, waits, options);
    return;
  }
  for (const aim of aimed.aims) {
    const point = onPage(place, aim);
    await group.page().mouse.click(point.x, point.y);
    if (await drawnAnew(group)) {
      // Drawn anew: chosen where the click landed, or the next point is tried.
      if ((await readChoiceAt(place.frame, aim, options)) !== false) return;
      continue;
    }
    if (chosen(await readRadioGroup(group, undefined, options), at, words)) return;
  }
  await readBack(
    group,
    at,
    words,
    { place, last: aimed.aims[aimed.aims.length - 1] ?? first },
    waits,
    options,
  );
}

/** Whether the group reads the option at `at`, still of those words, as chosen. */
const chosen = (reading: RadioGroupReading | null, at: number, words: string): boolean =>
  reading?.options[at]?.words === words && reading.options[at]?.checked === true;

/** After the clicks: the group reads the option as chosen within the wait, or the select failed, saying what the field holds. */
async function readBack(
  group: Locator,
  at: number,
  words: string,
  { place, last }: { place: Place; last: Point },
  { optionWaitMs, settleRetryMs }: RadioWaits,
  options: GroupOptions,
): Promise<void> {
  const until = Date.now() + optionWaitMs;
  // A group drawn anew is read where the last click landed: chosen there, or nothing there to read, ends the wait.
  const anewReads = async (): Promise<boolean | null> =>
    (await drawnAnew(group)) ? readChoiceAt(place.frame, last, options) : false;
  let reading: RadioGroupReading | null = null;
  for (;;) {
    if ((await anewReads()) !== false) return;
    reading = await readRadioGroup(group, settleRetryMs, options);
    if (chosen(reading, at, words)) return;
    if (Date.now() >= until) break;
    await group.page().waitForTimeout(settleRetryMs);
  }
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
 * tried, so a click that took is never undone by another; one the page drew
 * anew after a click is read where the click landed (`readChoiceAt`). Fails,
 * naming what it holds, when no point shows or none turns it.
 */
export async function toggleCheckbox(
  box: Locator,
  { optionWaitMs, settleRetryMs }: RadioWaits,
): Promise<void> {
  const holds = async (): Promise<boolean | null> =>
    (await readRadioGroup(box, undefined, CHECKBOX_OPTIONS))?.options[0]?.checked ?? null;
  const was = await holds();
  if (was === null) throw new ActionFailed('click', 'the checkbox could not be read');
  const aimed = await aimAtOption(box, 0, CHECKBOX_OPTIONS);
  const aims = aimed?.aims ?? [];
  const [first] = aims;
  if (first === undefined) {
    throw new ActionFailed('click', 'the checkbox shows nowhere a click would reach it');
  }
  const place = await placeOf(box);
  // What a click at a point left: the box, or the checkbox drawn there once the box left the page — turned, not, or unreadable there.
  const turnedAt = async (aim: Point): Promise<boolean | null> => {
    const now = (await drawnAnew(box))
      ? await readChoiceAt(place.frame, aim, CHECKBOX_OPTIONS)
      : await holds();
    return now === null ? ((await drawnAnew(box)) ? null : false) : now === !was;
  };
  // Done once it reads turned, or the page drew it anew where nothing reads as one checkbox.
  const settled = async (aim: Point): Promise<boolean> => (await turnedAt(aim)) !== false;
  const tries = first.self ? [first] : aims;
  for (const aim of tries) {
    const point = onPage(place, aim);
    if (first.self) await box.locator(CHECKBOX_OPTIONS).first().click();
    else await box.page().mouse.click(point.x, point.y);
    if (await settled(aim)) return;
    await box.page().waitForTimeout(settleRetryMs);
    if (await settled(aim)) return;
  }
  const last = tries[tries.length - 1] ?? first;
  const until = Date.now() + optionWaitMs;
  while (Date.now() < until) {
    if (await settled(last)) return;
    await box.page().waitForTimeout(settleRetryMs);
  }
  throw new ActionFailed(
    'click',
    `clicked the checkbox, and it still reads ${was ? 'checked' : 'unchecked'}`,
  );
}

/**
 * A radio no group holds, chosen by its click and read back as a group's
 * options are — chosen once it reads checked within the declared wait, read
 * where the click landed when the page drew it anew (`readChoiceAt`), and a
 * failure naming what it reads otherwise. One that reads checked already is
 * left as it is.
 */
export async function chooseLoneRadio(
  radio: Locator,
  { optionWaitMs, settleRetryMs }: RadioWaits,
): Promise<void> {
  const checked = (): Promise<boolean> =>
    radio.isChecked({ timeout: settleRetryMs }).catch(() => false);
  if (await checked()) return;
  const place = await placeOf(radio);
  const box = await radio.boundingBox();
  await radio.click();
  // Drawn anew, it is read where the click landed — its middle, in its own frame; nothing there to read leaves it to the next observation.
  const middle =
    box === null
      ? null
      : {
          x: box.x + box.width / 2 - place.offset.x,
          y: box.y + box.height / 2 - place.offset.y,
        };
  const chosenNow = async (): Promise<boolean> =>
    (await drawnAnew(radio))
      ? middle === null || (await readChoiceAt(place.frame, middle, RADIO_OPTIONS)) !== false
      : await checked();
  const until = Date.now() + optionWaitMs;
  while (Date.now() < until) {
    if (await chosenNow()) return;
    await radio.page().waitForTimeout(settleRetryMs);
  }
  throw new ActionFailed('select', 'clicked the radio, and it still reads unchosen');
}
