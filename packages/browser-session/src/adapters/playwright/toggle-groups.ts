import { elementKindOf } from '@sysdesign/contracts';
import type { Frame, Locator, Page } from 'playwright';

import type { SnapshotNode } from '../../core/snapshot/aria-snapshot';
import { CONTROLS_BESIDE_TOGGLES, QUESTION_CONTAINERS, TOGGLE_OPTIONS } from './dom-selectors';
import { readElementFacts } from './element-facts';
import type { NameGroup } from './name-groups';
import { readRadioGroup } from './radio-group';

/**
 * The roles that declare a box holds a widget's own controls or a way around
 * the site — a toolbar, a menu or a menu bar, a tab list, a tree, a grid, a
 * navigation. Toggle buttons in such a box, or in any box inside one, are no
 * question, and stay as the tree lists them.
 */
const OTHER_PURPOSES: ReadonlySet<string> = new Set([
  'toolbar',
  'menu',
  'menubar',
  'tablist',
  'tree',
  'treegrid',
  'grid',
  'navigation',
]);

/** Every node inside a box, as the tree nests them. */
const insideOf = (nodes: readonly SnapshotNode[], box: number): number[] => {
  const depth = nodes[box]?.depth ?? 0;
  const inside: number[] = [];
  for (let at = box + 1; at < nodes.length && (nodes[at]?.depth ?? 0) > depth; at += 1) {
    inside.push(at);
  }
  return inside;
};

/** How many toggle buttons a frame holds, or none when it does not answer within the wait: a busy frame holds no read. */
async function togglesIn(frame: Frame, waitMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<number>((resolve) => {
    timer = setTimeout(() => resolve(0), waitMs);
  });
  try {
    return await Promise.race([
      frame
        .locator(TOGGLE_OPTIONS)
        .count()
        .catch(() => 0),
      late,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether any frame of the page holds a button that declares whether it is
 * pressed, each frame given the facts timeout to answer and none read past
 * the deadline: none, and no box is read for one.
 */
async function holdsToggles(page: Page, timeout: number, deadline: number): Promise<boolean> {
  for (const frame of page.frames()) {
    if (Date.now() > deadline) return false;
    if ((await togglesIn(frame, timeout)) > 0) return true;
  }
  return false;
}

/**
 * Buttons that declare whether they are pressed (`aria-pressed`), two or more
 * in the smallest box with a ref the tree gives around them: one question,
 * chosen from as a group of checkboxes is, under the box's ref — when no box
 * around them, theirs included, declares another purpose (`OTHER_PURPOSES`);
 * the box is asked in a form, a fieldset or group or a dialog
 * (`QUESTION_CONTAINERS`), or holds an input it keeps the answer in;
 * the box holds no link, which is followed and never answered, and no other
 * control a person sees, as the element facts tell what a person sees (the
 * inputs a page keeps the answer in, hidden from sight, aside); no words
 * between two answers outside both, which would be a second question, as the
 * page renders them or the tree lists them; and each answer's words, as a
 * person reads them, told apart from the others'. Measured 2026-11-06: an
 * employer's application form drew its yes-or-no question about visa
 * sponsorship as two such buttons, "Yes" and "No", beside a hidden checkbox;
 * they were listed as two buttons with no question, the plan's askFields on
 * them was refused, and the step ran nothing. A page that holds no such
 * button costs one count per frame.
 */
export async function toggleGroups(
  page: Page,
  nodes: readonly SnapshotNode[],
  ancestorsOf: (index: number) => number[],
  timeout: number,
  deadline: number,
): Promise<NameGroup[]> {
  const buttonsIn = (box: number): number[] =>
    insideOf(nodes, box).filter((at) => nodes[at]?.role === 'button');
  // Every button's boxes, and how many buttons the tree lists inside each box, counted once.
  const chains = new Map<number, number[]>();
  nodes.forEach((node, index) => {
    if (node.role === 'button') chains.set(index, ancestorsOf(index));
  });
  const buttonsUnder = new Map<number, number>();
  for (const chain of chains.values()) {
    for (const at of chain) buttonsUnder.set(at, (buttonsUnder.get(at) ?? 0) + 1);
  }
  // Each button's box: the smallest box with a ref around it that holds another button the tree lists.
  const boxOf = new Map<number, number>();
  for (const [button, chain] of chains) {
    const box = chain.find((at) => nodes[at]?.ref !== null && (buttonsUnder.get(at) ?? 0) > 1);
    if (box !== undefined) boxOf.set(button, box);
  }
  // A box is gathered by a button with a ref, one a plan can press; a pressed one the tree gave no ref is still its answer.
  const boxes = new Set(
    [...boxOf].filter(([button]) => nodes[button]?.ref !== null).map(([, box]) => box),
  );
  if (boxes.size === 0 || !(await holdsToggles(page, timeout, deadline))) return [];
  /** Whether the tree lists words at a node between a box's first and last button, outside every button. */
  const wordsBetween = (at: number, first: number, last: number): boolean => {
    const node = nodes[at];
    if (node === undefined || at <= first || at >= last) return false;
    if (elementKindOf(node.role) !== 'static') return false;
    if (![node.inline, node.name].some((words) => (words ?? '').trim() !== '')) return false;
    return !ancestorsOf(at).some((up) => nodes[up]?.role === 'button');
  };
  /** Whether the tree shows a box that cannot hold one question, so it is not read in the page. */
  const refused = (box: number, buttons: readonly number[]): boolean => {
    // Every button in it is its own: a lone button around another question's box is not one of its answers.
    if (buttons.some((button) => boxOf.get(button) !== box)) return true;
    if ([box, ...ancestorsOf(box)].some((at) => OTHER_PURPOSES.has(nodes[at]?.role ?? ''))) {
      return true;
    }
    const inside = insideOf(nodes, box);
    // A link is followed, never answered, and no page keeps an answer in one: seen or not, it costs no read in the page.
    if (inside.some((at) => nodes[at]?.role === 'link')) return true;
    // Words between two answers — drawn by CSS, in a shadow root, an image's alternative text — ask a second question.
    const first = buttons[0] ?? box;
    const last = buttons[buttons.length - 1] ?? box;
    return inside.some((at) => wordsBetween(at, first, last));
  };
  const groups: NameGroup[] = [];
  for (const box of boxes) {
    const node = nodes[box];
    const buttons = buttonsIn(box);
    if (node?.ref === null || node === undefined || refused(box, buttons)) continue;
    if (Date.now() > deadline) break;
    const located = page.locator(`aria-ref=${node.ref}`);
    // Every button the tree lists in it a toggle the page holds as one question, a pressed one the tree gave no ref included.
    if ((await readToggleBox(located, timeout)) !== buttons.length) continue;
    if (await showsAnotherControl(located, timeout)) continue;
    // Each answer's words, as a person reads them, told apart from the others'.
    const reading = await readRadioGroup(located, timeout, TOGGLE_OPTIONS);
    const words = reading?.options.map((option) => option.words) ?? [];
    if (words.length === 0 || words.includes('') || new Set(words).size !== words.length) continue;
    const options = buttons.filter((at) => nodes[at]?.ref !== null);
    groups.push({ kind: 'toggle', box, options, declared: true });
  }
  return groups;
}

/**
 * Whether a box shows a person a control beside its toggle buttons, each read
 * by the element facts — so a control is seen here exactly when the
 * observation would list it seen — and one whose facts never come back taken
 * for seen.
 */
async function showsAnotherControl(box: Locator, timeout: number): Promise<boolean> {
  const others = box.locator(CONTROLS_BESIDE_TOGGLES);
  const count = await others.count().catch(() => -1);
  if (count < 0) return true;
  for (let at = 0; at < count; at += 1) {
    const facts = await readElementFacts(others.nth(at), timeout);
    if (facts === null || facts.visible) return true;
  }
  return false;
}

const readToggleBox = async (box: Locator, timeout: number): Promise<number> => {
  try {
    return await box.evaluate(
      toggleBoxInPage,
      { own: TOGGLE_OPTIONS, asked: QUESTION_CONTAINERS },
      { timeout },
    );
  } catch {
    return 0;
  }
};

/**
 * In the page: how many toggle buttons a box holds as one question — none
 * when it holds fewer than two; when it sits in no form, fieldset, group or
 * dialog and holds no input it keeps the answer in, so it asks nothing; or
 * when words its page renders sit between two of them outside both, which
 * ask a second question. One function on purpose — Playwright serialises it
 * whole.
 */
function toggleBoxInPage(box: Element, { own, asked }: { own: string; asked: string }): number {
  const options = Array.from(box.querySelectorAll(own));
  const [first] = options;
  const last = options[options.length - 1];
  if (first === undefined || last === undefined || options.length < 2) return 0;
  if (box.closest(asked) === null && box.querySelector('input, select, textarea') === null)
    return 0;
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.textContent ?? '').trim() === '') continue;
    if (options.some((option) => option.contains(node))) continue;
    const afterFirst =
      (first.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const beforeLast =
      (last.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
    if (afterFirst && beforeLast) return 0;
  }
  return options.length;
}
