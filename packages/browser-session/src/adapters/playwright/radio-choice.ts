import type { ElementHandle, Frame, Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { CHECKBOX_OPTIONS, RADIO_OPTIONS } from './dom-selectors';
import { onPage, placeOf, type Point } from './frames';
import { offeredNote } from './playwright-errors';
import {
  aimAtOption,
  answerable,
  readRadioGroup,
  type GroupOptions,
  type RadioGroupReading,
} from './radio-group';

/**
 * Whether the page answered a click by drawing what was clicked anew: the box
 * read before the click has left the page. What it holds now is the option
 * drawn where the click landed, read as the option it was (`readOption`) —
 * never the box that left, and never clicked again at points measured on the
 * drawing that left, where a click would land on whatever the page drew there
 * now and, on a checkbox, could turn it back. Measured 2026-11-06: an
 * application form drew its "Yes" box again, ticked, under new refs; the
 * session read the box it had clicked, saw it unticked, clicked the other
 * points of it, and the step failed with the box left as the last click
 * happened to leave it.
 */
const drawnAnew = async (box: Locator): Promise<boolean> =>
  // A box whose frame is gone cannot be counted: it has left the page as surely.
  (await box.count().catch(() => 0)) === 0;

/** What one option is, kept across the page drawing it anew, and whether it reads chosen. */
interface OptionRead {
  key: string;
  chosen: boolean;
}

/**
 * The option a click is aimed at — read before the click from the element,
 * or where the click landed once the page drew it anew: what it is (the name
 * and value of its native input, else its id, else the words of the box that
 * holds it alone) and whether it reads chosen; null when no box at the point
 * holds just one option, or the frame cannot be read.
 */
const readOption = (
  frame: Frame,
  target: { option: ElementHandle<Element> } | { at: Point },
  options: GroupOptions,
): Promise<OptionRead | null> =>
  frame
    .evaluate(optionInPage, {
      option: 'option' in target ? target.option : null,
      at: 'at' in target ? target.at : null,
      options,
    })
    .catch(() => null);

/**
 * In the page: an option read as the group's reader reads one — chosen by
 * its own state, its ARIA state, or the native input it draws. One function
 * on purpose — Playwright serialises it whole.
 */
function optionInPage({
  option,
  at,
  options,
}: {
  option: Element | null;
  at: { x: number; y: number } | null;
  options: string;
}): OptionRead | null {
  let found: Element | null = option;
  if (found === null && at !== null) {
    for (
      let node = document.elementFromPoint(at.x, at.y);
      node !== null;
      node = node.parentElement
    ) {
      const held = node.matches(options) ? [node] : Array.from(node.querySelectorAll(options));
      if (held.length > 1) return null;
      if (held.length === 1) {
        found = held[0] ?? null;
        break;
      }
    }
  }
  if (found === null) return null;
  const input = found.matches('input')
    ? found
    : found.querySelector('input[type="radio"], input[type="checkbox"]');
  const name = input?.getAttribute('name') ?? '';
  const value = input?.getAttribute('value') ?? '';
  let row: Element = found;
  while (row.parentElement !== null && row.parentElement.querySelectorAll(options).length === 1) {
    row = row.parentElement;
  }
  const key =
    name !== '' && value !== ''
      ? `${name}=${value}`
      : found.id !== ''
        ? `#${found.id}`
        : (row.textContent ?? '').replace(/\s+/g, ' ').trim();
  const chosen =
    found.getAttribute('aria-checked') === 'true' ||
    (found as HTMLInputElement).checked === true ||
    found.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked') !== null;
  return { key, chosen };
}

/** The option an element is, read before a click on it. */
async function optionBefore(
  frame: Frame,
  element: Locator,
  options: GroupOptions,
): Promise<OptionRead | null> {
  const handle = await element.elementHandle();
  try {
    return await readOption(frame, { option: handle }, options);
  } finally {
    await handle.dispose();
  }
}

/**
 * After a click the page answered by drawing its option anew: done when the
 * option drawn where the click landed is the one aimed at and reads as the
 * click meant it to; the failure, naming what it read there, otherwise.
 */
async function readAnew(
  frame: Frame,
  at: Point,
  { before, meant, options }: { before: OptionRead | null; meant: boolean; options: GroupOptions },
  failure: (now: OptionRead | null) => ActionFailed,
): Promise<void> {
  const now = await readOption(frame, { at }, options);
  if (now !== null && before !== null && now.key === before.key && now.chosen === meant) return;
  throw failure(now);
}

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
 * the click landed, as the option it was (`readOption`), and never clicked
 * again. Measured 2026-10-31: a job site's native radios were
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
  const before = await optionBefore(place.frame, group.locator(options).nth(at), options);
  const anew = (point: Point): Promise<void> =>
    readAnew(
      place.frame,
      point,
      { before, meant: true, options },
      () =>
        new ActionFailed(
          'select',
          `the page drew the field anew after the click, and ${JSON.stringify(words)} does not read chosen where it was clicked`,
        ),
    );
  if (first.self) {
    await group.locator(options).nth(at).click();
    await readBack(group, at, words, { last: first, anew }, waits, options);
    return;
  }
  for (const aim of aimed.aims) {
    const point = onPage(place, aim);
    await group.page().mouse.click(point.x, point.y);
    // Read, settle, read again: a page may draw the option anew a moment after the click.
    for (let read = 0; read < 2; read += 1) {
      if (await drawnAnew(group)) return anew(aim);
      if (chosen(await readRadioGroup(group, waits.settleRetryMs, options), at, words)) return;
      if (read === 0) await group.page().waitForTimeout(waits.settleRetryMs);
    }
  }
  const last = aimed.aims[aimed.aims.length - 1] ?? first;
  await readBack(group, at, words, { last, anew }, waits, options);
}

/** Whether the group reads the option at `at`, still of those words, as chosen. */
const chosen = (reading: RadioGroupReading | null, at: number, words: string): boolean =>
  reading?.options[at]?.words === words && reading.options[at]?.checked === true;

/** After the clicks: the group reads the option as chosen within the wait, or the select failed, saying what the field holds. */
async function readBack(
  group: Locator,
  at: number,
  words: string,
  { last, anew }: { last: Point; anew: (point: Point) => Promise<void> },
  { optionWaitMs, settleRetryMs }: RadioWaits,
  options: GroupOptions,
): Promise<void> {
  const until = Date.now() + optionWaitMs;
  let reading: RadioGroupReading | null = null;
  for (;;) {
    // A group drawn anew is read where the last click landed, as the option it was.
    if (await drawnAnew(group)) return anew(last);
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
 * anew after a click is read where the click landed, as the checkbox it was
 * (`readOption`), and never clicked again. Fails, naming what it holds, when
 * no point shows or none turns it.
 */
export async function toggleCheckbox(
  box: Locator,
  { optionWaitMs, settleRetryMs }: RadioWaits,
): Promise<void> {
  const holds = async (timeout?: number): Promise<boolean | null> =>
    (await readRadioGroup(box, timeout, CHECKBOX_OPTIONS))?.options[0]?.checked ?? null;
  const was = await holds();
  if (was === null) throw new ActionFailed('click', 'the checkbox could not be read');
  const aimed = await aimAtOption(box, 0, CHECKBOX_OPTIONS);
  const aims = aimed?.aims ?? [];
  const [first] = aims;
  if (first === undefined) {
    throw new ActionFailed('click', 'the checkbox shows nowhere a click would reach it');
  }
  const place = await placeOf(box);
  const before = await optionBefore(
    place.frame,
    box.locator(CHECKBOX_OPTIONS).first(),
    CHECKBOX_OPTIONS,
  );
  const anew = (point: Point): Promise<void> =>
    readAnew(
      place.frame,
      point,
      { before, meant: !was, options: CHECKBOX_OPTIONS },
      (now) =>
        new ActionFailed(
          'click',
          `the page drew the checkbox anew after the click, and it reads ${
            now === null ? 'as nothing' : now.chosen ? 'checked' : 'unchecked'
          } where it was clicked`,
        ),
    );
  const turned = async (): Promise<boolean> => (await holds(settleRetryMs)) === !was;
  const tries = first.self ? [first] : aims;
  for (const aim of tries) {
    const point = onPage(place, aim);
    if (first.self) await box.locator(CHECKBOX_OPTIONS).first().click();
    else await box.page().mouse.click(point.x, point.y);
    // Read, settle, read again: a page may draw the box anew a moment after the click.
    for (let read = 0; read < 2; read += 1) {
      if (await drawnAnew(box)) return anew(aim);
      if (await turned()) return;
      if (read === 0) await box.page().waitForTimeout(settleRetryMs);
    }
  }
  const last = tries[tries.length - 1] ?? first;
  const until = Date.now() + optionWaitMs;
  while (Date.now() < until) {
    if (await drawnAnew(box)) return anew(last);
    if (await turned()) return;
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
 * where the click landed as the radio it was when the page drew it anew
 * (`readOption`), and a failure naming what it reads otherwise. One that reads checked already is
 * left as it is.
 */
export async function chooseLoneRadio(
  radio: Locator,
  { optionWaitMs, settleRetryMs }: RadioWaits,
): Promise<void> {
  const checked = (): Promise<boolean> =>
    radio.isChecked({ timeout: settleRetryMs }).catch(() => false);
  if (await checked()) return;
  // Scrolled first, so the click needs no scroll and lands where it was measured.
  await radio.scrollIntoViewIfNeeded().catch(() => undefined);
  const place = await placeOf(radio);
  const box = await radio.boundingBox();
  const before = await optionBefore(place.frame, radio, RADIO_OPTIONS);
  await radio.click();
  // Drawn anew, it is read where the click landed — its middle, in its own frame — as the radio it was.
  const middle =
    box === null
      ? { x: -1, y: -1 }
      : { x: box.x + box.width / 2 - place.offset.x, y: box.y + box.height / 2 - place.offset.y };
  const until = Date.now() + optionWaitMs;
  while (Date.now() < until) {
    if (await drawnAnew(radio)) {
      return readAnew(
        place.frame,
        middle,
        { before, meant: true, options: RADIO_OPTIONS },
        () =>
          new ActionFailed(
            'select',
            'the page drew the radio anew after the click, and it does not read chosen where it was clicked',
          ),
      );
    }
    if (await checked()) return;
    await radio.page().waitForTimeout(settleRetryMs);
  }
  throw new ActionFailed('select', 'clicked the radio, and it still reads unchosen');
}
