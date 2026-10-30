import { ELEMENT_NAME_BOUND, HIDDEN_TRAITS, type HiddenTrait } from '@sysdesign/contracts';
import type { Locator } from 'playwright';

import { MODAL_DIALOGS } from './dom-selectors';

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
  /** Marked invalid by the page: `aria-invalid`, or the browser's own validity once a person has touched it. */
  invalid: boolean;
  disabled: boolean;
  visible: boolean;
  maxLength: number | null;
  hiddenTraits: string[];
  context: string | null;
  /** The `name` or `id` attribute, for an element the accessibility tree gives no name — a trap, usually. */
  nameHint: string | null;
  /** Whether a modal dialog encloses it: `aria-modal` on a dialog ancestor, or a native dialog opened modally. */
  modal: boolean;
  /** The text the DOM renders inside it — what a person reads on it; empty when it renders none. */
  text: string;
}

/**
 * Every fact about one element, read inside the page. One function on
 * purpose — Playwright serialises it whole into the page, so nothing here may
 * reach outside it — read as four blocks: what the control is and holds,
 * what state the page puts it in, whether a person could see and reach it,
 * and the words around it.
 *
 * The hidden traits are the deterministic half of trap detection:
 * `aria-hidden` by an ancestor, `offscreen` for a box no scrolling could
 * bring into view, `zero-size` by a collapsed or clipped box,
 * `tabindex-negative` by attribute, and `autocomplete-off-bait` for an
 * autocomplete-off input that no label, aria-label, placeholder or title
 * explains — the shape of a honeypot, read from what the page offers a person
 * rather than from a list of names.
 */
function elementFactsInPage(
  el: Element,
  { textMax, modal: modalDialogs }: { textMax: number; modal: typeof MODAL_DIALOGS },
): ElementFacts {
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
  /**
   * A radio group's options, each once — a native input drawn inside a
   * styled `role="radio"` is that option's control, not an option of its
   * own — and what a person reads on each: its own words, else its label.
   * Measured 2026-10-09: a form named both radios of a yes/no question after
   * the question itself, showed "Yes" and "No" only as their words, and
   * declared required on neither radio nor group.
   */
  const radios =
    attr('role') === 'radiogroup'
      ? Array.from(el.querySelectorAll('[role="radio"], input[type="radio"]')).filter(
          (radio) => radio.parentElement?.closest('[role="radio"]') == null,
        )
      : [];
  const optionLabel = (option: Element): string => text(option) || labelOf(option);
  const isChecked = (radio: Element): boolean =>
    radio.getAttribute('aria-checked') === 'true' ||
    (radio as HTMLInputElement).checked === true ||
    radio.querySelector('input[type="radio"]:checked') !== null;
  const radioSays = (radio: Element, name: string): boolean => {
    const own = radio.getAttribute(name);
    const control = radio.querySelector('input[type="radio"]');
    return (
      (own !== null && own !== 'false') || (control?.getAttribute(name) ?? 'false') !== 'false'
    );
  };
  /**
   * The question every option of a radio group is named after, when none of
   * them reads it — a group of one included. Measured 2026-10-12: a form's
   * acknowledgment was one radio named after its statement, showing "Yes" as
   * its words, in a group the tree gave no name and no legend; read as having
   * no question, it was put to the operator as "a field on the page".
   */
  const sharedQuestion = (): string => {
    const names = radios.map(
      (radio) => radio.getAttribute('aria-label') || byIds(radio.getAttribute('aria-labelledby')),
    );
    const first = names[0] ?? '';
    return first !== '' &&
      names.every((name) => name === first) &&
      !radios.some((radio) => text(radio) === first)
      ? first
      : '';
  };

  /**
   * What the control is and holds: its input type, its value, and the options
   * a person can answer with. Never an option the page disables, nor the
   * placeholder label option the HTML standard defines for a required select —
   * the first, empty-valued option, chosen only to mean nothing is; a select
   * resting on either holds nothing yet. Measured 2026-10-11: offered as a
   * lettered choice, a dropdown's disabled "Select an option" was picked, and
   * filling it timed out because the browser would not select it.
   */
  const readControl = (): Pick<ElementFacts, 'inputType' | 'value' | 'options'> => {
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
      const first = select.options[0];
      const placeholder =
        select.required &&
        !select.multiple &&
        select.size <= 1 &&
        first !== undefined &&
        first.value === '' &&
        first.parentElement === select
          ? first
          : null;
      const answerable = (option: HTMLOptionElement): boolean =>
        option !== placeholder && !option.matches(':disabled');
      options = Array.from(select.options)
        .filter(answerable)
        .map((option) => text(option) || option.value)
        .filter((option) => option.length > 0);
      const chosen = select.selectedOptions[0];
      value = chosen !== undefined && answerable(chosen) ? text(chosen) || chosen.value : null;
    } else if (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio')) {
      value = input.checked ? 'checked' : 'unchecked';
    } else if (tag === 'input' && inputType === 'file') {
      // A file control holds the file chosen, by name — never the placeholder path the browser reports as its value.
      value = input.files?.[0]?.name ?? null;
    } else if (tag === 'input' || tag === 'textarea') {
      value = input.value === '' ? null : input.value;
    } else if ((el as HTMLElement).isContentEditable) {
      value = text(el) || null;
    }
    if (options === null && role === 'radiogroup') {
      options = radios
        .filter((radio) => !radioSays(radio, 'disabled') && !radioSays(radio, 'aria-disabled'))
        .map(optionLabel)
        .filter((option) => option.length > 0);
      const chosen = radios.find(isChecked);
      value = chosen === undefined ? null : optionLabel(chosen) || null;
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
          .filter((option) => option.getAttribute('aria-disabled') !== 'true')
          .map((option) => text(option))
          .filter((option) => option.length > 0);
      }
    }
    if (options !== null && options.length === 0) options = null;
    return { inputType, value, options };
  };

  /** What state the page puts it in: required, disabled. */
  const readState = (): Pick<ElementFacts, 'required' | 'disabled'> => {
    const required =
      input.required === true ||
      attr('aria-required') === 'true' ||
      radios.some((radio) => radioSays(radio, 'required') || radioSays(radio, 'aria-required'));
    const disabled =
      input.disabled === true ||
      attr('aria-disabled') === 'true' ||
      el.closest('fieldset[disabled]') !== null;
    return { required, disabled };
  };

  /** Whether a person could see and reach it, and the traits of one they could not. */
  const readSight = (): Pick<ElementFacts, 'visible' | 'hiddenTraits'> => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const traits: string[] = [];
    if (el.closest('[aria-hidden="true"]') !== null) traits.push('aria-hidden');
    // Offscreen means out of anyone's reach: no scrolling of any box that clips
    // the element, nor of the document, could bring it into view. Walked up the
    // chain of boxes that clip it — which CSS draws through containing blocks,
    // not through every ancestor: an absolutely positioned box is clipped only
    // from its containing block upward, a fixed one only by an ancestor that
    // transforms or filters, else by the viewport alone, and an inline box clips
    // nothing. Each clipping box shows at most its own padding box, widened by
    // however far it can still scroll; what passes it is the part of that box
    // the element could reach, for the next. A field parked at left:-9999px is
    // outside every box; a footer below the fold of a dialog that scrolls is
    // inside its dialog's. Measured 2026-10-07 with the document's own extent
    // as the only box: a modal over a scroll-locked page had every control
    // below the fold "offscreen", its one Submit button refused 27 times, and
    // the fields scrolled above the fold counted as traps.
    type Box = { left: number; top: number; right: number; bottom: number };
    const intersects = (a: Box, b: Box): boolean =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const within = (a: Box, b: Box): Box => ({
      left: Math.max(a.left, b.left),
      top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right),
      bottom: Math.min(a.bottom, b.bottom),
    });
    /** Whether a box establishes the containing block of fixed and absolute descendants: it transforms, filters, or contains. */
    const anchors = (css: CSSStyleDeclaration): boolean =>
      css.transform !== 'none' ||
      css.perspective !== 'none' ||
      css.filter !== 'none' ||
      /paint|layout|strict|content/.test(css.contain);
    const unreachable = (): boolean => {
      const viewport: Box = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };
      let box: Box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      let position = style.position;
      for (let node = el.parentElement; node !== null; node = node.parentElement) {
        const css = getComputedStyle(node);
        // What the box is positioned against: ancestors below it clip nothing of it.
        if (position === 'fixed' && !anchors(css)) continue;
        if (position === 'absolute' && css.position === 'static' && !anchors(css)) continue;
        if (css.display === 'inline' || css.display === 'contents') continue;
        const overflow = css.overflowX + css.overflowY;
        const scrolls = /auto|scroll/.test(overflow);
        if (scrolls || /hidden|clip/.test(overflow)) {
          const outer = node.getBoundingClientRect();
          const shown: Box = {
            left: outer.left + node.clientLeft,
            top: outer.top + node.clientTop,
            right: outer.left + node.clientLeft + node.clientWidth,
            bottom: outer.top + node.clientTop + node.clientHeight,
          };
          const reach: Box = scrolls
            ? {
                left: box.left - (node.scrollWidth - node.clientWidth - node.scrollLeft),
                right: box.right + node.scrollLeft,
                top: box.top - (node.scrollHeight - node.clientHeight - node.scrollTop),
                bottom: box.bottom + node.scrollTop,
              }
            : box;
          if (!intersects(reach, shown)) return true;
          box = within(reach, shown);
        }
        position = css.position;
      }
      if (position === 'fixed') return !intersects(box, viewport);
      const root = el.ownerDocument.documentElement;
      const reach: Box = {
        left:
          box.left -
          (Math.max(root.scrollWidth, root.clientWidth) - root.clientWidth - window.scrollX),
        right: box.right + window.scrollX,
        top:
          box.top -
          (Math.max(root.scrollHeight, root.clientHeight) - root.clientHeight - window.scrollY),
        bottom: box.bottom + window.scrollY,
      };
      return !intersects(reach, viewport);
    };
    const offscreen = unreachable();
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
    return { visible, hiddenTraits: traits };
  };

  /** The words around it, its length cap, whether a modal encloses it, and whether the page marks it invalid. */
  const readSurroundings = (): Pick<
    ElementFacts,
    'maxLength' | 'context' | 'nameHint' | 'modal' | 'invalid' | 'text'
  > => {
    const maxLength =
      (tag === 'input' || tag === 'textarea') && input.maxLength > 0 ? input.maxLength : null;
    // What a file control accepts is what the page tells a person beside it.
    const accept =
      tag === 'input' && (attr('type') ?? 'text').toLowerCase() === 'file'
        ? (attr('accept') ?? '')
        : '';
    const context = [
      byIds(attr('aria-describedby')),
      attr('placeholder') ?? '',
      text(el.closest('fieldset')?.querySelector('legend')),
      sharedQuestion(),
      accept === '' ? '' : `accepts ${accept}`,
    ]
      .filter((part) => part.length > 0)
      .join(' · ');

    let modal = false;
    try {
      modal = el.closest(modalDialogs.any) !== null;
    } catch {
      // An engine without `:modal` answers the ARIA half alone.
      modal = el.closest(modalDialogs.aria) !== null;
    }

    // Any invalid state the page declares — true, grammar, spelling — or the browser's own.
    const ariaInvalid = attr('aria-invalid');
    let invalid =
      (ariaInvalid !== null && ariaInvalid !== 'false') ||
      radios.some((radio) => radioSays(radio, 'aria-invalid'));
    try {
      invalid = invalid || el.matches(':user-invalid');
    } catch {
      // An engine without `:user-invalid` answers the ARIA half alone.
    }
    return {
      maxLength,
      context: context === '' ? null : context,
      nameHint: attr('name') ?? attr('id'),
      modal,
      invalid,
      text: ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, textMax),
    };
  };

  return { ...readControl(), ...readState(), ...readSight(), ...readSurroundings() };
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
    return await locator.evaluate(
      elementFactsInPage,
      { textMax: ELEMENT_NAME_BOUND.target, modal: MODAL_DIALOGS },
      { timeout },
    );
  } catch {
    return null;
  }
}

/** Only the traits the contract declares, in its order. */
export const hiddenTraitsOf = (facts: ElementFacts): HiddenTrait[] =>
  HIDDEN_TRAITS.filter((trait) => facts.hiddenTraits.includes(trait));
