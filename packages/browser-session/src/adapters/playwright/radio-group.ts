import type { Locator } from 'playwright';

import { CHECKBOX_OPTIONS, RADIO_OPTIONS } from './dom-selectors';
import type { Point } from './frames';

/** Which options a group is read by: its radios, or its checkboxes. */
export type GroupOptions = typeof RADIO_OPTIONS | typeof CHECKBOX_OPTIONS;

/** One option of a group as a person reads it: its words, whether it is chosen, and whether the page disables it. */
interface RadioOption {
  words: string;
  checked: boolean;
  disabled: boolean;
}

/** One point a person's click on an option may land, in its frame's viewport, and whether it lands on the option itself. */
interface RadioAim extends Point {
  self: boolean;
}

/**
 * A group of choices as a person reads it — a radio group, or a group of
 * checkboxes read the same way: every option in the page's order (the
 * options selector), disabled ones included; the question every option is
 * named after, empty when they are not; whether the page marks any option
 * required or invalid; and, when one option is aimed at, the points a
 * person's click on it lands, in the order a person tries them.
 */
export interface RadioGroupReading {
  options: RadioOption[];
  question: string;
  required: boolean;
  invalid: boolean;
  aims: RadioAim[];
}

/** The group read in the page, with the option at `aimAt` aimed at; null when the read fails. */
const readInPage = async (
  group: Locator,
  aimAt: number | null,
  options: GroupOptions,
  timeout?: number,
): Promise<RadioGroupReading | null> => {
  try {
    return await group.evaluate(radioGroupInPage, { radioOptions: options, aimAt }, { timeout });
  } catch {
    return null;
  }
};

/** The group under a locator as a person reads it, by its radios unless told its options are checkboxes; null when the read fails. */
export const readRadioGroup = (
  group: Locator,
  timeout?: number,
  options: GroupOptions = RADIO_OPTIONS,
): Promise<RadioGroupReading | null> => readInPage(group, null, options, timeout);

/** The group read again with the option at `index` aimed at, its row scrolled into view; null when the read fails. */
export const aimAtOption = (
  group: Locator,
  index: number,
  options: GroupOptions = RADIO_OPTIONS,
): Promise<RadioGroupReading | null> => readInPage(group, index, options);

/** The options a person can answer with: words to answer by, on an option the page does not disable. */
export const answerable = (reading: RadioGroupReading): RadioOption[] =>
  reading.options.filter((option) => option.words !== '' && !option.disabled);

/**
 * In the page: a radio group read as a person reads it. One function on
 * purpose — Playwright serialises it whole, so nothing here reaches outside it.
 *
 * An option's words are its own, else its name — its ARIA label, what its
 * `aria-labelledby` names, else its label — unless that name is the question
 * every option is named after, which tells none apart; then the words of its
 * row, the outermost container in the group that holds it and no other
 * option; for an option with no row of its own, the words after it up to the
 * next option; for a row it shares, the header of its column. Words count only
 * as a person reads them: never what the page hides, clips away or marks
 * aria-hidden, nor what it announces apart (an alert, a status, a tooltip, a
 * live region), nor the option's own description, nor the question — the
 * elements that name the option after it, or show it whole. Measured
 * 2026-10-31: a job site named every radio of a yes/no question after the
 * question and showed "Yes" and "No" only beside them; a review then drew the
 * question named by `<label for>`, grid rows worded by their column headers,
 * rows with hidden, clipped, alert and described words, a lone option sharing
 * its row with its statement, bare table rows and a flat layout.
 *
 * The points a click on one option is aimed at are where a person aims it:
 * the radio itself, the labels the page declares for it, the box drawn around
 * it, the marks drawn beside it, its row, its words. A point counts only where
 * it lands inside the option's own row or one of its labels, and never on a
 * control of another kind, so a row another option's row overlaps is clicked
 * where it shows, and one that shows nowhere is not clicked at all.
 */
function radioGroupInPage(
  group: Element,
  { radioOptions, aimAt }: { radioOptions: string; aimAt: number | null },
): RadioGroupReading {
  const doc = group.ownerDocument;
  const radios = Array.from(group.querySelectorAll(radioOptions));
  const controls =
    'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="combobox"], [contenteditable="true"]';
  const tidy = (words: string | null | undefined): string =>
    (words ?? '').replace(/\s+/g, ' ').trim();
  const byIds = (ids: string | null): Element[] =>
    (ids ?? '')
      .split(/\s+/)
      .filter((id) => id.length > 0)
      .map((id) => doc.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
  const labelsOf = (option: Element): Element[] =>
    Array.from((option as HTMLInputElement).labels ?? []);

  /** Whether the page shows an element to a person: rendered, visible, not clipped away, not declared hidden. */
  const shown = (element: Element): boolean => {
    if (element.getAttribute('aria-hidden') === 'true' || (element as HTMLElement).hidden) {
      return false;
    }
    const css = getComputedStyle(element);
    if (css.display === 'none' || css.visibility !== 'visible' || css.opacity === '0') return false;
    const box = element.getBoundingClientRect();
    const clipped =
      css.clip === 'rect(0px, 0px, 0px, 0px)' ||
      css.clipPath === 'inset(100%)' ||
      (css.overflow === 'hidden' && box.width <= 1 && box.height <= 1);
    return !clipped;
  };
  /** Whether the page announces an element apart from what it sits in: a live region, by role or by declaration. */
  const apart = (element: Element): boolean => {
    const live = element.getAttribute('aria-live');
    return (
      ['alert', 'status', 'log', 'timer', 'marquee', 'tooltip'].includes(
        element.getAttribute('role') ?? '',
      ) ||
      (live !== null && live !== 'off')
    );
  };
  /** The words a person reads in a node, past the elements `skip` names; a block's words stand apart from its neighbours'. */
  const wordsIn = (node: Node, skip: (element: Element) => boolean): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as Element;
    if (!shown(element) || apart(element) || skip(element)) return '';
    const inner = Array.from(element.childNodes, (child) => wordsIn(child, skip)).join('');
    return getComputedStyle(element).display.startsWith('inline') ? inner : ` ${inner} `;
  };
  const nothing = (): boolean => false;
  /** Whether a person reads a text node: every element from it up to `within` shown, not apart, not skipped. */
  const readsWithin = (
    text: Node,
    within: Element,
    skip: (element: Element) => boolean,
  ): boolean => {
    for (let node = text.parentElement; node !== null; node = node.parentElement) {
      if (!shown(node) || apart(node) || skip(node)) return false;
      if (node === within) return true;
    }
    return false;
  };

  /** The elements an option takes its name from: none for an ARIA label, else what its `aria-labelledby` names, else its first label. */
  const namingOf = (option: Element): Element[] => {
    if (tidy(option.getAttribute('aria-label')) !== '') return [];
    const labelledBy = byIds(option.getAttribute('aria-labelledby'));
    return tidy(labelledBy.map((node) => node.textContent).join(' ')) !== ''
      ? labelledBy
      : labelsOf(option).slice(0, 1);
  };
  /** What an option is named by: its ARIA label, else the words of the elements it takes its name from. */
  const nameOf = (option: Element): string =>
    tidy(option.getAttribute('aria-label')) ||
    tidy(
      namingOf(option)
        .map((node) => node.textContent)
        .join(' '),
    );
  /**
   * The question every option is named after, when none of them shows it as
   * its own words — a group of one included. Measured 2026-10-12: a form's
   * acknowledgment was one radio named after its statement, showing "Yes" as
   * its words, in a group the tree gave no name and no legend; read as having
   * no question, it was put to the operator as "a field on the page".
   */
  const question = ((): string => {
    const names = radios.map(nameOf);
    const first = names[0] ?? '';
    return first !== '' &&
      names.every((name) => name === first) &&
      !radios.some((radio) => tidy(wordsIn(radio, nothing)) === first)
      ? first
      : '';
  })();

  /** The outermost container in the group that holds the option and no other; the option itself when none does. */
  const rowOf = (option: Element): Element => {
    const others = radios.filter((other) => other !== option);
    const holdsAnother = (node: Element): boolean => others.some((other) => node.contains(other));
    let row = option;
    for (
      let node = option.parentElement;
      node !== null && !holdsAnother(node);
      node = node.parentElement
    ) {
      row = node;
      // An option alone in its group has the whole group for its row: the box drawn for it.
      if (node === group) break;
    }
    return row;
  };
  /** What a person does not read as the option's words: its description, and the question — the elements naming the option after it, or showing it whole. */
  const asideFrom = (option: Element): ((element: Element) => boolean) => {
    const described = byIds(option.getAttribute('aria-describedby'));
    const naming = question === '' ? [] : namingOf(option);
    return (element) =>
      described.includes(element) ||
      naming.includes(element) ||
      (question !== '' && tidy(element.textContent) === question);
  };
  /** For an option with no row of its own: the words after it, up to the next option. */
  const segmentWords = (option: Element, aside: (element: Element) => boolean): string => {
    const segment = doc.createRange();
    segment.setStartAfter(option);
    const next = radios[radios.indexOf(option) + 1];
    if (next === undefined) segment.setEnd(group, group.childNodes.length);
    else segment.setEndBefore(next);
    const walker = doc.createTreeWalker(group, NodeFilter.SHOW_TEXT);
    let words = '';
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      if (segment.intersectsNode(text) && readsWithin(text, group, aside)) {
        words += ` ${text.textContent ?? ''}`;
      }
    }
    return tidy(words);
  };
  /** The header of the column an option's cell sits in: the cells its `headers` names, else the column header at its index. */
  const columnWords = (option: Element): string => {
    const cell = option.closest('td, th, [role="cell"], [role="gridcell"]');
    if (cell === null) return '';
    const declared = byIds(cell.getAttribute('headers'));
    if (declared.length > 0) {
      return tidy(declared.map((node) => wordsIn(node, nothing)).join(' '));
    }
    const columnOf = (node: Element): number => {
      const index = Number(node.getAttribute('aria-colindex'));
      if (Number.isInteger(index) && index > 0) return index - 1;
      return node instanceof HTMLTableCellElement
        ? node.cellIndex
        : Array.from(node.parentElement?.children ?? []).indexOf(node);
    };
    const column = columnOf(cell);
    const table = cell.closest('table, [role="table"], [role="grid"], [role="treegrid"]');
    const header = Array.from(
      table?.querySelectorAll('thead th, th[scope="col"], [role="columnheader"]') ?? [],
    ).find((node) => node !== cell && columnOf(node) === column);
    return header === undefined ? '' : tidy(wordsIn(header, nothing));
  };
  /** An option's words, as a person reads them on it. */
  const wordsOf = (option: Element): string => {
    const aside = asideFrom(option);
    const own = tidy(wordsIn(option, aside));
    if (own !== '') return own;
    const name = nameOf(option);
    if (name !== '' && name !== question) return name;
    const row = rowOf(option);
    const inRow = row === option ? segmentWords(option, aside) : tidy(wordsIn(row, aside));
    return inRow || columnWords(option) || name;
  };

  const says = (radio: Element, attribute: string): boolean => {
    const own = radio.getAttribute(attribute);
    const control = radio.querySelector('input[type="radio"], input[type="checkbox"]');
    return (
      (own !== null && own !== 'false') || (control?.getAttribute(attribute) ?? 'false') !== 'false'
    );
  };
  const isChecked = (radio: Element): boolean =>
    radio.getAttribute('aria-checked') === 'true' ||
    (radio as HTMLInputElement).checked === true ||
    radio.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked') !== null;

  /** The points a person's click on the option lands, in the order a person tries them; none when no point of it shows. */
  const aimsAt = (option: Element): RadioAim[] => {
    const row = rowOf(option);
    const labels = labelsOf(option);
    row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const centre = (box: DOMRect): [number, number] | null =>
      box.width > 0 && box.height > 0 ? [box.left + box.width / 2, box.top + box.height / 2] : null;
    const middle = (element: Element): [number, number] | null =>
      centre(element.getBoundingClientRect());
    const inside = (landing: Element): boolean =>
      row.contains(landing) || labels.some((label) => label.contains(landing));
    // Another control a click would land on — a link in the option's own label included — is
    // never clicked; a control the option holds, or one drawn around it, is the option's own.
    const foreign = (landing: Element): boolean => {
      const control = landing.closest(controls);
      return (
        control !== null &&
        control !== option &&
        !option.contains(control) &&
        !control.contains(option)
      );
    };
    // The box drawn around it, and the marks drawn beside it: boxes in its row with no words and no control.
    const around: Element[] = [];
    for (
      let node = option.parentElement;
      node !== null && node !== row && row.contains(node);
      node = node.parentElement
    ) {
      if (middle(node) !== null) {
        around.push(node);
        break;
      }
    }
    const beside =
      row === option
        ? []
        : Array.from(row.querySelectorAll('*')).filter(
            (node) =>
              node.childElementCount === 0 &&
              !node.contains(option) &&
              !node.matches(controls) &&
              shown(node) &&
              middle(node) !== null &&
              tidy(wordsIn(node, nothing)) === '',
          );
    /** The middle of the first line of words a person reads in a container, never words in another control. */
    const wordsAt = (
      container: Element,
      skip: (element: Element) => boolean,
    ): [number, number] | null => {
      const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const words = doc.createRange();
      for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
        const holder = text.parentElement;
        if (tidy(text.textContent) === '' || holder === null || foreign(holder)) continue;
        if (!readsWithin(text, container, skip)) continue;
        words.selectNodeContents(text);
        const line = words.getClientRects()[0];
        if (line !== undefined) return centre(line);
      }
      return null;
    };
    // Its row's words, and its labels' own: a label is the option's wherever a person clicks it.
    const points = [option, ...labels, ...around, ...beside, row]
      .map((element) => middle(element))
      .concat([wordsAt(row, asideFrom(option)), ...labels.map((label) => wordsAt(label, nothing))]);
    const aims: RadioAim[] = [];
    const landed = new Set<Element>();
    for (const point of points) {
      if (point === null) continue;
      const landing = doc.elementFromPoint(point[0], point[1]);
      if (landing === null || landed.has(landing)) continue;
      landed.add(landing);
      const self = landing === option || option.contains(landing);
      if (self || (inside(landing) && !foreign(landing))) {
        aims.push({ x: point[0], y: point[1], self });
      }
    }
    return aims;
  };

  const aimed = aimAt === null ? undefined : radios[aimAt];
  return {
    options: radios.map((radio) => ({
      words: wordsOf(radio),
      checked: isChecked(radio),
      disabled: says(radio, 'disabled') || says(radio, 'aria-disabled'),
    })),
    question,
    required: radios.some((radio) => says(radio, 'required') || says(radio, 'aria-required')),
    invalid: radios.some((radio) => says(radio, 'aria-invalid')),
    aims: aimed === undefined ? [] : aimsAt(aimed),
  };
}
