import { HIDDEN_TRAITS, type HiddenTrait } from '@sysdesign/contracts';
import type { Locator } from 'playwright';

/**
 * The DOM facts about one interactive element, read in the page. The
 * function below is serialised into the browser by Playwright, so it is
 * self-contained: no import, no closure, every trait spelled as a literal.
 * The node side filters those literals through the contract's vocabulary,
 * so a trait the page named that the contract does not know is dropped
 * rather than shipped.
 */
export interface ElementFacts {
  inputType: string | null;
  value: string | null;
  options: string[] | null;
  required: boolean;
  disabled: boolean;
  visible: boolean;
  maxLength: number | null;
  hiddenTraits: string[];
  context: string | null;
  /** The `name` or `id` attribute, for an element the accessibility tree gives no name — a trap, usually. */
  nameHint: string | null;
}

/**
 * Runs inside the page. The hidden traits are the deterministic half of trap
 * detection: `aria-hidden` by an ancestor, `offscreen` by geometry against
 * the whole document (not the viewport — scrolling hides nothing), `zero-size`
 * by a collapsed or clipped box, `tabindex-negative` by attribute, and
 * `autocomplete-off-bait` for an autocomplete-off input that no label,
 * aria-label, placeholder or title explains — the shape of a honeypot, read
 * from what the page offers a person rather than from a list of names.
 */
export function elementFactsInPage(el: Element): ElementFacts {
  const tag = el.tagName.toLowerCase();
  const input = el as HTMLInputElement;
  const attr = (name: string): string | null => el.getAttribute(name);
  const text = (node: Element | null | undefined): string =>
    (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const byIds = (ids: string | null): string =>
    (ids ?? '')
      .split(/\s+/)
      .filter((id) => id.length > 0)
      .map((id) => text(el.ownerDocument.getElementById(id)))
      .filter((part) => part.length > 0)
      .join(' ');
  const labelOf = (node: Element): string =>
    node.getAttribute('aria-label') ||
    byIds(node.getAttribute('aria-labelledby')) ||
    text(Array.from((node as HTMLInputElement).labels ?? [])[0]) ||
    text(node);

  const inputType =
    tag === 'input'
      ? (attr('type') ?? 'text').toLowerCase()
      : tag === 'textarea'
        ? 'textarea'
        : tag === 'select'
          ? 'select'
          : null;
  const role = attr('role');

  let value: string | null = null;
  let options: string[] | null = null;
  if (tag === 'select') {
    const select = el as HTMLSelectElement;
    options = Array.from(select.options)
      .map((option) => text(option) || option.value)
      .filter((option) => option.length > 0);
    const chosen = select.selectedOptions[0];
    value = chosen ? text(chosen) || chosen.value : null;
  } else if (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio')) {
    value = input.checked ? 'checked' : 'unchecked';
  } else if (tag === 'input' || tag === 'textarea') {
    value = input.value === '' ? null : input.value;
  } else if ((el as HTMLElement).isContentEditable) {
    value = text(el) || null;
  }
  if (options === null && role === 'radiogroup') {
    options = Array.from(el.querySelectorAll('[role="radio"], input[type="radio"]'))
      .map(labelOf)
      .filter((option) => option.length > 0);
  }
  if (options === null && (role === 'listbox' || role === 'combobox')) {
    const controls = attr('aria-controls');
    const list =
      controls !== null
        ? el.ownerDocument.getElementById(controls)
        : role === 'listbox'
          ? el
          : null;
    if (list !== null) {
      options = Array.from(list.querySelectorAll('[role="option"]'))
        .map((option) => text(option))
        .filter((option) => option.length > 0);
    }
  }
  if (options !== null && options.length === 0) options = null;

  const required = input.required === true || attr('aria-required') === 'true';
  const disabled =
    input.disabled === true ||
    attr('aria-disabled') === 'true' ||
    el.closest('fieldset[disabled]') !== null;

  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const root = el.ownerDocument.documentElement;
  const pageWidth = Math.max(root.scrollWidth, root.clientWidth);
  const pageHeight = Math.max(root.scrollHeight, root.clientHeight);
  const left = rect.left + window.scrollX;
  const top = rect.top + window.scrollY;
  const traits: string[] = [];
  if (el.closest('[aria-hidden="true"]') !== null) traits.push('aria-hidden');
  const offscreen =
    left + rect.width <= 0 || top + rect.height <= 0 || left >= pageWidth || top >= pageHeight;
  if (offscreen) traits.push('offscreen');
  const clipped =
    style.clip === 'rect(0px, 0px, 0px, 0px)' ||
    style.clipPath === 'inset(100%)' ||
    (style.overflow === 'hidden' && rect.width <= 1 && rect.height <= 1);
  if (rect.width === 0 || rect.height === 0 || clipped) traits.push('zero-size');
  const tabindex = attr('tabindex');
  if (tabindex !== null && Number(tabindex) < 0) traits.push('tabindex-negative');
  const explained =
    (input.labels !== undefined && input.labels !== null && input.labels.length > 0) ||
    attr('aria-label') !== null ||
    attr('aria-labelledby') !== null ||
    attr('placeholder') !== null ||
    attr('title') !== null;
  if (tag === 'input' && (attr('autocomplete') ?? '').toLowerCase() === 'off' && !explained) {
    traits.push('autocomplete-off-bait');
  }

  const visible =
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    style.opacity !== '0' &&
    !offscreen &&
    !clipped &&
    el.closest('[aria-hidden="true"]') === null;

  const maxLength =
    (tag === 'input' || tag === 'textarea') && input.maxLength > 0 ? input.maxLength : null;
  const context = [
    byIds(attr('aria-describedby')),
    attr('placeholder') ?? '',
    text(el.closest('fieldset')?.querySelector('legend')),
  ]
    .filter((part) => part.length > 0)
    .join(' · ');

  return {
    inputType,
    value,
    options,
    required,
    disabled,
    visible,
    maxLength,
    hiddenTraits: traits,
    context: context === '' ? null : context,
    nameHint: attr('name') ?? attr('id'),
  };
}

/**
 * The facts for one located element, or null when the element is gone, the
 * read fails, or it does not answer inside `timeout`. A facts read is a single
 * DOM evaluate on an element Playwright has already located, so it answers in
 * about a millisecond; left to inherit the action timeout it was given fifteen
 * seconds, which is the whole of the hazard `readWithinBudget` bounds.
 */
export async function readElementFacts(
  locator: Locator,
  timeout?: number,
): Promise<ElementFacts | null> {
  try {
    return await locator.evaluate(elementFactsInPage, undefined, { timeout });
  } catch {
    return null;
  }
}

/**
 * Each ref read until the budget is spent, and a count of those left unread.
 *
 * One observation used to be unbounded: a read per element, each inheriting
 * the fifteen-second action timeout, so a page of 128 elements whose renderer
 * had stalled could hold a single observation for over half an hour. Measured
 * live on 2026-10-03 — a session sat eighteen minutes past its own
 * eighteen-minute rail inside one observe, because the engine checks its rails
 * between phases and no phase was ending. A phase the rails cannot interrupt
 * has to bound itself.
 *
 * An unread element is counted, never guessed at and never listed: the adapter
 * cannot say whether it is enabled, visible or a trap, and the session may act
 * only on elements the observation listed.
 */
export async function readWithinBudget<T>(
  refs: readonly string[],
  read: (ref: string) => Promise<T | null>,
  now: () => number,
  budgetMs: number,
): Promise<{ facts: Map<string, T>; unread: number }> {
  const deadline = now() + budgetMs;
  const facts = new Map<string, T>();
  let unread = 0;
  for (const ref of refs) {
    const value = now() < deadline ? await read(ref) : null;
    if (value === null) unread += 1;
    else facts.set(ref, value);
  }
  return { facts, unread };
}

/** Only the traits the contract declares, in its order. */
export const hiddenTraitsOf = (facts: ElementFacts): HiddenTrait[] =>
  HIDDEN_TRAITS.filter((trait) => facts.hiddenTraits.includes(trait));
