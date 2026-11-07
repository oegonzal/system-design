import { ELEMENT_KIND_BY_ROLE } from '@sysdesign/contracts';

/**
 * What the page says is a modal dialog in front of everything else: a modal
 * dialog role, or a native dialog opened modally. Declared once for every
 * in-page reader — the element facts and the busy read — and passed into the
 * page, where a module constant does not reach.
 */
export const MODAL_DIALOGS = {
  any: '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog:modal',
  /** For an engine without `:modal`: the ARIA half alone. */
  aria: '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
} as const;

/**
 * The options of a radio group, each once: every radio — a `role="radio"`
 * or a native one — but a native input drawn inside a styled `role="radio"`,
 * which is that option's control, not an option of its own. Declared once for
 * the group's reader (`radio-group.ts`), which reads each option's words and
 * aims at one, and the select, which checks the one it chose in the same order.
 */
export const RADIO_OPTIONS =
  '[role="radio"]:not([role="radio"] *), input[type="radio"]:not([role="radio"] *)';

/**
 * The options of a group of checkboxes, each once, read the way a radio
 * group's are (`RADIO_OPTIONS`): every checkbox — a `role="checkbox"` or a
 * native one — but a native input drawn inside a styled `role="checkbox"`.
 */
export const CHECKBOX_OPTIONS =
  '[role="checkbox"]:not([role="checkbox"] *), input[type="checkbox"]:not([role="checkbox"] *)';

/**
 * The options of a group of toggle buttons, each once, read the way a radio
 * group's are (`RADIO_OPTIONS`): every button that declares whether it is
 * pressed — a native button or a `role="button"` carrying `aria-pressed` —
 * but one drawn inside another element that declares `aria-pressed`.
 */
export const TOGGLE_OPTIONS =
  'button[aria-pressed]:not([aria-pressed] *), [role="button"][aria-pressed]:not([aria-pressed] *)';

/**
 * Every control a person acts on — a native control, a link, an editable
 * region, an element whose role the role table says affords an action
 * (`ELEMENT_KIND_BY_ROLE`) — but a toggle button and what is drawn inside
 * one: what a box of toggle buttons may hold beside them only out of a
 * person's sight (`toggle-groups.ts`), as the element facts tell it.
 */
export const CONTROLS_BESIDE_TOGGLES = `:is(${[
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[contenteditable="true"]',
  ...Object.keys(ELEMENT_KIND_BY_ROLE).map((role) => `[role="${role}"]`),
].join(', ')}):not([aria-pressed]):not([aria-pressed] *)`;

/**
 * Where a page asks its questions: a form, a fieldset or a group, a dialog. A
 * box of toggle buttons is one question only inside one of these, or holding
 * an input it keeps the answer in (`toggle-groups.ts`) — never the action row
 * a card or a panel draws among its other content.
 */
export const QUESTION_CONTAINERS =
  'form, [role="form"], fieldset, [role="group"], dialog, [role="dialog"], [role="alertdialog"]';

/**
 * The ARIA states that say an option is chosen, each when it reads "true": a
 * radio's or a checkbox's, and a toggle button's. Declared once for the
 * group's reader (`radio-group.ts`) and the read of an option the page drew
 * anew (`redrawn-choice.ts`), and passed into the page, where a module
 * constant does not reach, so the two never read a choice apart.
 */
export const CHOSEN_STATES: readonly string[] = ['aria-checked', 'aria-pressed'];
