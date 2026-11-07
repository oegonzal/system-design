import type { Locator, Page } from 'playwright';

import type { SnapshotNode } from '../../core/snapshot/aria-snapshot';
import { CHECKBOX_OPTIONS, RADIO_OPTIONS, TOGGLE_OPTIONS } from './dom-selectors';
import type { GroupOptions } from './radio-group';
import { toggleGroups } from './toggle-groups';

/**
 * Choices a page groups by their name alone, checkboxes it draws itself, and
 * buttons it declares pressed or not, in a box of their own (`toggle-groups.ts`).
 *
 * The HTML standard makes the radios that share a name and a form one radio
 * button group — one question, answered once — whether or not the page
 * declares a group around them; checkboxes sharing a name are sent as one
 * field's values the same way; ARIA knows a group only by its role. Measured
 * 2026-11-01: an employer's form put "Are you legally authorized to work…?"
 * above two radios in a list of their own, and "Availability?" above three
 * checkboxes, with no group role and no fieldset; they were observed as
 * fields "Yes", "No", "Immediately"… with no question, the checkboxes could
 * not be asked at all, and the plan guessed one by click. Measured
 * 2026-11-05: another form drew its radios itself, so the tree gave them no
 * ref, and its required visa question could be neither asked nor answered.
 *
 * Each such group is read as the group it is, under the ref of the smallest
 * box the tree gives a ref that holds every option of the group and no other
 * control — what the group's own reader (`radio-group.ts`) reads, chooses and
 * reads back. A checkbox alone in its group that the tree gave no ref — an
 * input drawn by its page with no box of its own, its label and its drawn box
 * what a person clicks — is listed under the box that holds it alone.
 * Measured 2026-10-29 → 10-31: a job site's "Follow <company>" checkbox, which
 * its mission unticks before sending, had no ref from then on, and four
 * sessions stalled on the page that sends. Options with no such box — laid
 * out flat among other fields, or in a box another control shares — are left
 * as the tree lists them.
 */
export type GroupKind = 'radio' | 'checkbox' | 'toggle';

/** The options selector each kind of group is read by. */
export const GROUP_OPTIONS: Readonly<Record<GroupKind, GroupOptions>> = {
  radio: RADIO_OPTIONS,
  checkbox: CHECKBOX_OPTIONS,
  toggle: TOGGLE_OPTIONS,
};

/**
 * A box the observation lists under its own ref, as the browser acts on it:
 * the kind of choice it holds, and whether it is one checkbox the page drew
 * — clicked to turn it the other way — rather than a group chosen from.
 */
export interface ChoiceBox {
  ref: string;
  kind: GroupKind;
  drawn: boolean;
}

/**
 * One group of choices read as one question: the index of its box's node in
 * the tree, and of the tree's nodes for its options — a group the page makes
 * by name alone; or one whose box is the question's own (`declared`) — a box
 * the page declares a group by its role, or one of toggle buttons
 * (`toggle-groups.ts`) — whose own name, when its author gave it one, is its
 * question.
 */
export interface NameGroup {
  kind: GroupKind;
  box: number;
  options: number[];
  declared: boolean;
}

/** The kinds of choice a page makes of its own inputs: grouped by name, or drawn by the page. */
type InputKind = Exclude<GroupKind, 'toggle'>;

/** A checkbox the tree gave no ref, alone in its group: the index of the box that holds it alone, and of its own node. */
export interface DrawnCheckbox {
  box: number;
  option: number;
}

/** What one box holds of one kind of choice: the size of its first option's group, whether it holds all of it, and whether anything no box of its own may hold. */
interface BoxReading {
  groupSize: number;
  holdsAll: boolean;
  shared: boolean;
}

/** For each node, its parent's index — the last node before it at a smaller depth — or -1. */
const parentsOf = (nodes: readonly SnapshotNode[]): number[] => {
  const open: number[] = [];
  return nodes.map((node, index) => {
    while (open.length > 0 && (nodes[open[open.length - 1] ?? 0]?.depth ?? 0) >= node.depth) {
      open.pop();
    }
    const parent = open[open.length - 1] ?? -1;
    open.push(index);
    return parent;
  });
};

/**
 * The groups of one read whose options the page declares no group around,
 * each under the box that holds it alone; the checkboxes the tree gave no ref
 * that a box the page declares a group gathers as one question; the buttons
 * that declare whether they are pressed, two or more in a box of their own
 * (`toggleGroups`); and the rest of those checkboxes, each under the box that
 * holds it alone. A box's options are read in the page together, however many
 * sit in it, and the walk stops once the deadline passes: an option not
 * reached is listed as the tree lists it.
 */
export async function readNameGroups(
  page: Page,
  nodes: readonly SnapshotNode[],
  timeout: number,
  deadline: number,
): Promise<{ groups: NameGroup[]; drawn: DrawnCheckbox[] }> {
  const parents = parentsOf(nodes);
  const ancestorsOf = (index: number): number[] => {
    const ancestors: number[] = [];
    for (let parent = parents[index] ?? -1; parent >= 0; parent = parents[parent] ?? -1) {
      ancestors.push(parent);
    }
    return ancestors;
  };
  const kindOf = (node: SnapshotNode): InputKind | null =>
    node.role === 'radio' ? 'radio' : node.role === 'checkbox' ? 'checkbox' : null;
  // A radio inside a radiogroup the page declares is that group's, read by its own role.
  const choices = nodes.flatMap((node, index) => {
    const kind = kindOf(node);
    return kind === null ||
      (kind === 'radio' && ancestorsOf(index).some((at) => nodes[at]?.role === 'radiogroup'))
      ? []
      : [{ index, kind }];
  });
  const read = new Map<string, BoxReading | null>();
  const boxReading = async (box: number, kind: InputKind): Promise<BoxReading | null> => {
    const key = `${kind}:${box}`;
    const ref = nodes[box]?.ref ?? null;
    if (ref === null) return null;
    if (!read.has(key))
      read.set(key, await readBox(page.locator(`aria-ref=${ref}`), kind, timeout));
    return read.get(key) ?? null;
  };
  const groups: NameGroup[] = [];
  const drawn: DrawnCheckbox[] = [];
  const placed = new Set<number>();
  for (const { index, kind } of choices) {
    if (placed.has(index) || Date.now() > deadline) continue;
    const unreffed = nodes[index]?.ref === null;
    for (const box of ancestorsOf(index)) {
      if (nodes[box]?.ref === null) continue;
      const reading = await boxReading(box, kind);
      if (reading === null || reading.shared) break;
      if (!reading.holdsAll) continue;
      if (reading.groupSize > 1) {
        const options = choices.flatMap((choice) =>
          choice.kind === kind && ancestorsOf(choice.index).includes(box) ? [choice.index] : [],
        );
        options.forEach((option) => placed.add(option));
        groups.push({ kind, box, options, declared: false });
      } else if (kind === 'checkbox' && unreffed) {
        placed.add(index);
        drawn.push({ box, option: index });
      }
      break;
    }
  }
  const declared = await declaredGroups(page, nodes, ancestorsOf, drawn, timeout);
  const gathered = new Set(declared.flatMap((group) => group.options));
  const toggles = await toggleGroups(page, nodes, ancestorsOf, timeout, deadline);
  return {
    groups: [...groups, ...declared, ...toggles],
    drawn: drawn.filter((checkbox) => !gathered.has(checkbox.option)),
  };
}

/**
 * Checkboxes its page drew, each the only checkbox in the box listed for it,
 * that a box the page declares a group by its role — a fieldset,
 * `role="group"` — gathers as one question: no other control in it, each
 * answer's words told apart from the others', and no words between two
 * answers outside both, which would be a second question. Chosen from as
 * checkboxes sharing a name are, under the group's ref. Measured 2026-11-06:
 * two application forms drew each answer of a question — "Yes" and "No", or
 * a list to pick from — as a nameless checkbox beside its words, the
 * question's answers alone in a group; each was listed as a checkbox apart
 * with nothing to tell it by, the plan's askFields on them was refused, and
 * both sessions ended on three failed steps.
 */
async function declaredGroups(
  page: Page,
  nodes: readonly SnapshotNode[],
  ancestorsOf: (index: number) => number[],
  drawn: readonly DrawnCheckbox[],
  timeout: number,
): Promise<NameGroup[]> {
  const byGroup = new Map<number, number[]>();
  for (const { option } of drawn) {
    const group = ancestorsOf(option).find((at) => nodes[at]?.role === 'group');
    if (group === undefined || nodes[group]?.ref === null) continue;
    byGroup.set(group, [...(byGroup.get(group) ?? []), option]);
  }
  const groups: NameGroup[] = [];
  for (const [box, options] of byGroup) {
    if (options.length < 2) continue;
    const reading = await readBox(
      page.locator(`aria-ref=${nodes[box]?.ref}`),
      'checkbox',
      timeout,
      true,
    );
    if (reading !== null && !reading.shared && reading.groupSize === options.length) {
      groups.push({ kind: 'checkbox', box, options, declared: true });
    }
  }
  return groups;
}

const readBox = async (
  box: Locator,
  kind: InputKind,
  timeout: number,
  declared = false,
): Promise<BoxReading | null> => {
  try {
    return await box.evaluate(choiceBoxInPage, { kind, declared }, { timeout });
  } catch {
    return null;
  }
};

/**
 * In the page: what a box holds of one kind of choice — the group of its
 * first native option, the options sharing its name and form in its tree (an
 * option with no name is a group of its own), and whether it holds all of
 * it; and whether it holds what no box of their own may hold: another
 * control, or options of another group. A box the page declares a group
 * holds its options as one group whatever names they carry. One function on
 * purpose — Playwright serialises it whole, so nothing here reaches outside it.
 */
function choiceBoxInPage(
  box: Element,
  { kind, declared }: { kind: 'radio' | 'checkbox'; declared: boolean },
): BoxReading {
  const own = `input[type="${kind}"]`;
  const options = Array.from(box.querySelectorAll<HTMLInputElement>(own));
  const [first] = options;
  if (first === undefined) return { groupSize: 0, holdsAll: false, shared: false };
  const others =
    'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), input[type="radio"], input[type="checkbox"], select, textarea, button, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="textbox"], [role="listbox"], [role="radiogroup"], [contenteditable="true"]';
  const foreign = Array.from(box.querySelectorAll(others)).some(
    (control) =>
      !(control instanceof HTMLInputElement && control.type === kind) &&
      // A styled role drawn around one of its own native options is that option, not another control.
      !(control.getAttribute('role') === kind && control.querySelector(own) !== null),
  );
  const sameGroup = (option: HTMLInputElement): boolean =>
    first.name !== '' && option.name === first.name && option.form === first.form;
  if (foreign || (!declared && options.length > 1 && !options.every(sameGroup))) {
    return { groupSize: 0, holdsAll: false, shared: true };
  }
  if (declared) {
    // Each answer's row: the outermost box inside the group that holds it and no other answer.
    const rowOf = (option: Element): Element => {
      let row: Element = option;
      while (row.parentElement !== null && row.parentElement !== box) {
        const holds = options.filter((other) => row.parentElement?.contains(other)).length;
        if (holds > 1) break;
        row = row.parentElement;
      }
      return row;
    };
    const rows = options.map(rowOf);
    const words = rows.map((row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim());
    const apart = new Set(words).size === words.length;
    // Words between two answers that no answer's row holds ask a second question.
    const [firstRow] = rows;
    const lastRow = rows[rows.length - 1];
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    let between = false;
    for (let node = walker.nextNode(); node !== null && !between; node = walker.nextNode()) {
      const inRow = rows.some((row) => row.contains(node));
      const afterFirst =
        firstRow !== undefined &&
        (firstRow.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const beforeLast =
        lastRow !== undefined &&
        (lastRow.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
      between = !inRow && afterFirst && beforeLast && (node.textContent ?? '').trim() !== '';
    }
    return { groupSize: options.length, holdsAll: true, shared: !apart || between };
  }
  const root = first.getRootNode() as Document | ShadowRoot;
  const group =
    first.name === ''
      ? [first]
      : Array.from(root.querySelectorAll<HTMLInputElement>(own)).filter(sameGroup);
  return {
    groupSize: group.length,
    holdsAll: group.every((option) => box.contains(option)),
    shared: false,
  };
}
