import type { ElementHandle, Frame, Locator } from 'playwright';

import { ActionFailed } from '../../core/ports';
import { CHOSEN_STATES } from './dom-selectors';
import type { Point } from './frames';
import type { GroupOptions } from './radio-group';

/** How a choice is waited on after a click: for it to show, and between reads of it. */
export interface ChoiceWaits {
  optionWaitMs: number;
  settleRetryMs: number;
}

/**
 * Whether the page answered a click by drawing what was clicked anew: the box
 * read before the click has left the page. What it holds now is the option
 * drawn where the click landed, read as the option it was (`readAnew`) —
 * never the box that left, and never clicked again at points measured on the
 * drawing that left, where a click would land on whatever the page drew there
 * now and, on a checkbox, could turn it back. Measured 2026-11-06: an
 * application form drew its "Yes" box again, ticked, under new refs; the
 * session read the box it had clicked, saw it unticked, clicked the other
 * points of it, and the step failed with the box left as the last click
 * happened to leave it.
 */
export const drawnAnew = async (box: Locator): Promise<boolean> =>
  // A box whose frame is gone cannot be counted: it has left the page as surely.
  (await box.count().catch(() => 0)) === 0;

/**
 * What one option is, kept across the page drawing it anew: the name and value
 * of its native input, else the words of its own label — never an id, which a
 * page may mint afresh each time it draws — or nothing to find it again by.
 */
interface OptionKey {
  key: string;
  kind: 'value' | 'label' | 'none';
}

/** An option read: what it is, and whether it reads chosen. */
export interface OptionRead extends OptionKey {
  chosen: boolean;
}

/**
 * In the page: an option read as the group's reader reads one — chosen by its
 * own state, a chosen ARIA state (`CHOSEN_STATES`), or the native input it
 * draws — found as given, by its key anywhere in the frame, or as the one
 * option the smallest box around a point holds; null when none is. One
 * function on purpose — Playwright serialises it whole.
 */
function optionInPage({
  option,
  find,
  at,
  options,
  chosenStates,
}: {
  option: Element | null;
  find: { key: string; kind: 'value' | 'label' | 'none' } | null;
  at: { x: number; y: number } | null;
  options: string;
  chosenStates: readonly string[];
}): { key: string; kind: 'value' | 'label' | 'none'; chosen: boolean } | null {
  const tidy = (text: string | null | undefined): string =>
    (text ?? '').replace(/\s+/g, ' ').trim();
  const inputOf = (el: Element): HTMLInputElement | null =>
    (el.matches('input')
      ? el
      : el.querySelector('input[type="radio"], input[type="checkbox"]')) as HTMLInputElement | null;
  const labelOf = (el: Element): string => {
    for (const each of [el, inputOf(el)]) {
      if (each === null) continue;
      const aria = tidy(each.getAttribute('aria-label'));
      if (aria !== '') return aria;
      const by = (each.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .filter((id) => id !== '');
      const named = tidy(by.map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
      if (named !== '') return named;
      const labels = (each as HTMLInputElement).labels;
      const labelled = tidy(
        Array.from(labels ?? [])
          .map((label) => label.textContent)
          .join(' '),
      );
      if (labelled !== '') return labelled;
    }
    return '';
  };
  const keyOf = (el: Element): { key: string; kind: 'value' | 'label' | 'none' } => {
    const input = inputOf(el);
    const name = input?.getAttribute('name') ?? '';
    const value = input?.getAttribute('value') ?? '';
    if (name !== '' && value !== '') return { key: `${name}=${value}`, kind: 'value' };
    const label = labelOf(el);
    return label !== '' ? { key: label, kind: 'label' } : { key: '', kind: 'none' };
  };
  const chosenOf = (el: Element): boolean =>
    chosenStates.some((state) => el.getAttribute(state) === 'true') ||
    (el as HTMLInputElement).checked === true ||
    el.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked') !== null;
  let found: Element | null = option;
  if (found === null && find !== null && find.kind !== 'none') {
    const matching = Array.from(document.querySelectorAll(options)).filter(
      (each) => keyOf(each).key === find.key,
    );
    found = matching.length === 1 ? (matching[0] ?? null) : null;
  }
  if (found === null && at !== null && (find === null || find.kind === 'none')) {
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
  return found === null ? null : { ...keyOf(found), chosen: chosenOf(found) };
}

/** The option an element is, read before a click on it. */
export async function optionBefore(
  frame: Frame,
  element: Locator,
  options: GroupOptions,
): Promise<OptionRead | null> {
  const handle = await element.elementHandle();
  try {
    return await frame
      .evaluate(optionInPage, {
        option: handle as ElementHandle<Element>,
        find: null,
        at: null,
        options,
        chosenStates: CHOSEN_STATES,
      })
      .catch(() => null);
  } finally {
    await handle.dispose();
  }
}

/**
 * After a click the page answered by drawing its option anew: the option is
 * found again by what it was — anywhere in its frame by its value or label,
 * else as the option drawn where the click landed — and read until it reads
 * as the click meant, within the declared wait. Done then; a failure naming
 * that option when it still reads the other way; left to the next
 * observation when it cannot be found again at all.
 */
export async function readAnew(
  frame: Frame,
  at: Point,
  {
    before,
    meant,
    options,
    waits,
  }: { before: OptionRead | null; meant: boolean; options: GroupOptions; waits: ChoiceWaits },
  failure: (now: OptionRead) => ActionFailed,
): Promise<void> {
  const find = before === null ? null : { key: before.key, kind: before.kind };
  const until = Date.now() + waits.optionWaitMs;
  let now: OptionRead | null = null;
  for (;;) {
    now = await frame
      .evaluate(optionInPage, { option: null, find, at, options, chosenStates: CHOSEN_STATES })
      .catch(() => null);
    if (now !== null && now.chosen === meant) return;
    if (Date.now() >= until) break;
    await frame.page().waitForTimeout(waits.settleRetryMs);
  }
  if (now !== null) throw failure(now);
}
