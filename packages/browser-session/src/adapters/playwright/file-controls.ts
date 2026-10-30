import {
  ELEMENT_NAME_BOUND,
  ELEMENT_VALUE_BOUND,
  LANDMARK_ROLES,
  excerpt,
  type LandmarkRole,
  type ObservedElement,
} from '@sysdesign/contracts';
import type { Locator, Page } from 'playwright';

import { MODAL_DIALOGS } from './dom-selectors';
import { readElementFacts } from './element-facts';

/**
 * The file controls a page hides: `<input type="file">` behind the page's
 * own styled button, label or drop zone, with no box a person could see and
 * so no node the accessibility tree reports — on every form measured, the
 * one way a résumé is attached. Playwright's file setter drives such a
 * control without sight, so each is listed as an element of its own, with a
 * ref of the adapter's (`f1`, `f2`…) that resolves to the nth file control in
 * document order rather than to a tree node. A file control the page shows
 * has a node of its own and is read with the rest.
 */
export const FILE_CONTROLS = 'input[type="file"]';

/** The adapter's own ref for a hidden file control, and which control it is: the nth in document order. */
export interface FileControlRef {
  ref: string;
  nth: number;
}

/** One read of every file control the page hides: the elements, and how each ref resolves. */
export interface FileControlsReading {
  elements: ObservedElement[];
  refs: FileControlRef[];
}

interface FileControlWords {
  /** What labels it: its own label, the label around it, or the attribute that names it. */
  name: string;
  /** The file chosen so far, by name, or empty. */
  file: string;
  /** What the control accepts, as the page declares it. */
  accept: string;
  landmark: string | null;
  scope: { role: string; name: string; modal: boolean } | null;
}

/** The landmark roles and what the DOM calls each: the outermost one around a control is the page's top-level landmark. */
const LANDMARK_SELECTORS: readonly { role: LandmarkRole; selector: string }[] = [
  { role: 'banner', selector: 'header, [role="banner"]' },
  { role: 'navigation', selector: 'nav, [role="navigation"]' },
  { role: 'main', selector: 'main, [role="main"]' },
  { role: 'complementary', selector: 'aside, [role="complementary"]' },
  { role: 'search', selector: 'search, [role="search"]' },
  { role: 'contentinfo', selector: 'footer, [role="contentinfo"]' },
];

/** Self-contained: Playwright serialises it whole into the page, so nothing here reaches outside the function. */
function fileControlWordsInPage(
  el: Element,
  {
    landmarks,
    modal,
  }: { landmarks: readonly { role: string; selector: string }[]; modal: typeof MODAL_DIALOGS },
): FileControlWords {
  const text = (node: Element | null | undefined): string =>
    (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const byIds = (ids: string | null): string =>
    (ids ?? '')
      .split(/\s+/)
      .filter((id) => id.length > 0)
      .map((id) => text(el.ownerDocument.getElementById(id)))
      .filter((part) => part.length > 0)
      .join(' ');
  const input = el as HTMLInputElement;
  const name =
    el.getAttribute('aria-label') ||
    byIds(el.getAttribute('aria-labelledby')) ||
    text(Array.from(input.labels ?? [])[0]) ||
    text(el.closest('label')) ||
    el.getAttribute('name') ||
    el.id ||
    '';
  let landmark: string | null = null;
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    const hit = landmarks.find((entry) => node.matches(entry.selector));
    if (hit !== undefined) landmark = hit.role;
  }
  const dialog = el.closest('dialog, [role="dialog"], [role="alertdialog"]');
  const isModal = (node: Element): boolean => {
    try {
      return node.matches(modal.any);
    } catch {
      return node.matches(modal.aria);
    }
  };
  return {
    name,
    file: input.files?.[0]?.name ?? '',
    accept: el.getAttribute('accept') ?? '',
    landmark,
    scope:
      dialog === null
        ? null
        : {
            role: dialog.getAttribute('role') ?? 'dialog',
            name:
              dialog.getAttribute('aria-label') || byIds(dialog.getAttribute('aria-labelledby')),
            modal: isModal(dialog),
          },
  };
}

const isLandmarkRole = (role: string | null): role is LandmarkRole =>
  role !== null && (LANDMARK_ROLES as readonly string[]).includes(role);

/** Every file control the page hides, as elements with refs of the adapter's own; one the page shows is left to the tree's read. */
export async function readFileControls(
  page: Page,
  factsTimeoutMs: number,
): Promise<FileControlsReading> {
  const controls = page.locator(FILE_CONTROLS);
  const count = await controls.count().catch(() => 0);
  const reading: FileControlsReading = { elements: [], refs: [] };
  for (let nth = 0; nth < count; nth += 1) {
    const control = controls.nth(nth);
    const facts = await readElementFacts(control, factsTimeoutMs);
    if (facts === null || facts.visible) continue;
    const words = await readWords(control, factsTimeoutMs);
    if (words === null) continue;
    const ref = `f${reading.refs.length + 1}`;
    reading.refs.push({ ref, nth });
    reading.elements.push({
      ref,
      role: 'button',
      name: excerpt(words.name, ELEMENT_NAME_BOUND.target),
      text: null,
      kind: 'uploadable',
      inputType: 'file',
      value: words.file === '' ? null : excerpt(words.file, ELEMENT_VALUE_BOUND.target),
      options: null,
      optionsOmitted: 0,
      required: facts.required,
      invalid: facts.invalid,
      disabled: facts.disabled,
      visible: false,
      maxLength: null,
      // Hidden by the page's own design, not a trap: the traits mark what a person could never see and should not answer.
      hiddenTraits: [],
      context:
        words.accept === '' ? null : excerpt(`accepts ${words.accept}`, ELEMENT_NAME_BOUND.target),
      scope:
        words.scope === null
          ? null
          : {
              // The tree knows two dialog roles; anything else a page calls a dialog is read as one.
              role: words.scope.role === 'alertdialog' ? 'alertdialog' : 'dialog',
              name: excerpt(words.scope.name, ELEMENT_NAME_BOUND.target),
              modal: words.scope.modal,
            },
      landmark: isLandmarkRole(words.landmark) ? words.landmark : null,
    });
  }
  return reading;
}

const readWords = async (control: Locator, timeout: number): Promise<FileControlWords | null> => {
  try {
    return await control.evaluate(
      fileControlWordsInPage,
      { landmarks: LANDMARK_SELECTORS, modal: MODAL_DIALOGS },
      { timeout },
    );
  } catch {
    return null;
  }
};
