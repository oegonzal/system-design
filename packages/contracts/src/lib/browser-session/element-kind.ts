/**
 * What an element is, from its role and the control beneath it: the kinds a
 * plan can act on, the roles whose inline text is a value, and the one table
 * every reader derives a kind from.
 */
/**
 * Roles whose inline text in a snapshot is what the control holds, not what
 * it is called: a textbox's line ends with its value. Words a person reads on
 * an unnamed element are gathered from everything beneath it except these.
 */
export const VALUE_ROLES = ['textbox', 'searchbox', 'combobox', 'spinbutton'] as const;

/** What an element affords: typed into, chosen from, pressed, or only read. */
export const ELEMENT_KINDS = ['fillable', 'selectable', 'clickable', 'static'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Role → kind, as a table; a role not listed is `static`. */
export const ELEMENT_KIND_BY_ROLE: Readonly<Record<string, ElementKind>> = {
  textbox: 'fillable',
  searchbox: 'fillable',
  spinbutton: 'fillable',
  combobox: 'selectable',
  listbox: 'selectable',
  radiogroup: 'selectable',
  radio: 'selectable',
  checkbox: 'clickable',
  switch: 'clickable',
  button: 'clickable',
  link: 'clickable',
  tab: 'clickable',
  menuitem: 'clickable',
  option: 'clickable',
};

/**
 * What a role affords on its own — all the observer knows before it reads the
 * page, which is why the adapter filters `static` nodes with this and decides
 * the element's kind with `elementKind` once the DOM facts are in hand.
 */
export const elementKindOf = (role: string): ElementKind => ELEMENT_KIND_BY_ROLE[role] ?? 'static';

/**
 * Input types that are chosen, toggled or picked rather than typed into. The
 * exceptions are what this names, because the text-entry types are open-ended
 * — `text`, `search`, `email`, `tel`, `url`, `password`, `date` and whatever
 * HTML adds next — so a list of those would call each new one unfillable.
 */
export const NON_TEXT_INPUT_TYPES = [
  'select',
  'checkbox',
  'radio',
  'file',
  'range',
  'color',
] as const;

/** Whether the control beneath an element takes typed text; an element with no control does not. */
export const acceptsTypedText = (inputType: string | null): boolean =>
  inputType !== null && !(NON_TEXT_INPUT_TYPES as readonly string[]).includes(inputType);

/**
 * Roles the role name alone does not settle, and the kind each takes when the
 * control beneath it accepts typed text. An ARIA combobox is editable or not
 * by what it is built on: a `<textarea role="combobox">` is a search box and
 * is typed into, while `role="combobox"` on a button pops a list and is not.
 * Measured live on 2026-10-03 — the role-only table called a site's search
 * box `selectable`, the `limits` validator refused `fill` on it as "cannot be
 * typed into", and the session stopped at its failure rail with the mission's
 * one step never run.
 */
export const ELEMENT_KIND_WHEN_TYPED: Readonly<Record<string, ElementKind>> = {
  combobox: 'fillable',
};

/**
 * What an element affords, from its role and the control beneath it. Every
 * unambiguous role is the table's to decide; a role listed as ambiguous is
 * settled by the DOM facts the page already gave, never by the name alone.
 */
export const elementKind = (
  role: string,
  facts: { readonly inputType: string | null },
): ElementKind => {
  const typed = ELEMENT_KIND_WHEN_TYPED[role];
  return typed !== undefined && acceptsTypedText(facts.inputType) ? typed : elementKindOf(role);
};
