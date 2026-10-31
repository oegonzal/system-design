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
