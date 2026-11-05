import type { Locator, Page } from 'playwright';

import type { SnapshotNode } from '../../core/snapshot/aria-snapshot';

/**
 * Radios a page groups by their name alone. The HTML standard makes the
 * radios that share a name and a form one radio button group — one question,
 * answered once — whether or not the page declares a group around them; ARIA
 * knows a group only by its role. Measured 2026-11-01: an employer's form put
 * "Are you legally authorized to work…?" above two radios in a list of their
 * own, with no radiogroup role and no fieldset, and they were observed as two
 * fields "Yes" and "No" with no question. Measured 2026-11-05: another drew
 * its radios itself, so the tree gave the radios no ref at all, and its
 * required visa question could be neither asked nor answered.
 *
 * Each such group is read as the radio group it is, under the ref of the
 * smallest box the tree gives a ref that holds every radio of the group and
 * no other control — what the group's own reader (`radio-group.ts`) reads,
 * chooses and reads back. A group with no such box — radios laid out flat
 * among other fields, or a box another control shares — and a radio alone in
 * its group are left as the tree lists them.
 */
export interface RadioNameGroup {
  /** The index of the box's node in the tree. */
  box: number;
  /** The indexes of the tree's radio nodes inside it: the group's options, never listed apart from it. */
  options: number[];
}

/** What a box holds of radios: all of one group and nothing else, or something no group's box may hold. */
interface BoxReading {
  holdsOneGroup: boolean;
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
 * The radio button groups of one read whose radios the page declares no
 * radiogroup around, each under the box that holds it alone. A box is read in
 * the page once however many radios sit in it, and the walk stops once the
 * deadline passes: a group not reached is listed as the tree lists it.
 */
export async function readRadioNameGroups(
  page: Page,
  nodes: readonly SnapshotNode[],
  timeout: number,
  deadline: number,
): Promise<RadioNameGroup[]> {
  const parents = parentsOf(nodes);
  const ancestorsOf = (index: number): number[] => {
    const ancestors: number[] = [];
    for (let parent = parents[index] ?? -1; parent >= 0; parent = parents[parent] ?? -1) {
      ancestors.push(parent);
    }
    return ancestors;
  };
  const undeclared = nodes.flatMap((node, index) =>
    node.role === 'radio' &&
    !ancestorsOf(index).some((ancestor) => nodes[ancestor]?.role === 'radiogroup')
      ? [index]
      : [],
  );
  const read = new Map<number, BoxReading | null>();
  const groups: RadioNameGroup[] = [];
  const grouped = new Set<number>();
  for (const radio of undeclared) {
    if (grouped.has(radio) || Date.now() > deadline) continue;
    for (const box of ancestorsOf(radio)) {
      const ref = nodes[box]?.ref ?? null;
      if (ref === null) continue;
      if (!read.has(box)) read.set(box, await readBox(page.locator(`aria-ref=${ref}`), timeout));
      const reading = read.get(box) ?? null;
      if (reading === null || reading.shared) break;
      if (!reading.holdsOneGroup) continue;
      const options = undeclared.filter((option) => ancestorsOf(option).includes(box));
      options.forEach((option) => grouped.add(option));
      groups.push({ box, options });
      break;
    }
  }
  return groups;
}

const readBox = async (box: Locator, timeout: number): Promise<BoxReading | null> => {
  try {
    return await box.evaluate(radioBoxInPage, undefined, { timeout });
  } catch {
    return null;
  }
};

/**
 * In the page: whether a box holds every radio of one radio button group —
 * the radios sharing its first radio's name and form, in its tree — and no
 * other control; and whether it holds what no group's box may: another
 * control, or radios of another group. One function on purpose — Playwright
 * serialises it whole, so nothing here reaches outside it.
 */
function radioBoxInPage(box: Element): BoxReading {
  const radios = Array.from(box.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const [first] = radios;
  if (first === undefined) return { holdsOneGroup: false, shared: false };
  const sameGroup = (radio: HTMLInputElement): boolean =>
    radio.name === first.name && radio.form === first.form;
  const others =
    'input:not([type="hidden"]):not([type="radio"]), select, textarea, button, [role="button"], [role="checkbox"], [role="switch"], [role="combobox"], [role="textbox"], [role="listbox"], [role="radiogroup"], [contenteditable="true"]';
  if (first.name === '' || !radios.every(sameGroup) || box.querySelector(others) !== null) {
    return { holdsOneGroup: false, shared: true };
  }
  const root = first.getRootNode() as Document | ShadowRoot;
  const group = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
    sameGroup,
  );
  return {
    holdsOneGroup: group.length > 1 && group.every((radio) => box.contains(radio)),
    shared: false,
  };
}
