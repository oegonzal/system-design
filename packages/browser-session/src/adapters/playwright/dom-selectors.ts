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
