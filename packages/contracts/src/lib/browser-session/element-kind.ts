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

/** What an element affords: typed into, chosen from, a file put into it, pressed, or only read. */
export const ELEMENT_KINDS = [
  'fillable',
  'selectable',
  'uploadable',
  'clickable',
  'static',
] as const;
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
 * Input types whose control settles the kind whatever the role: a file input
 * reads as a button in the tree — a person presses it — and takes a file,
 * never a click or typed text. Consulted before the role.
 */
export const ELEMENT_KIND_BY_INPUT_TYPE: Readonly<Record<string, ElementKind>> = {
  file: 'uploadable',
};

/**
 * What an element affords, from its role and the control beneath it. A
 * control whose type settles it is the input-type table's to decide; every
 * other unambiguous role is the role table's; a role listed as ambiguous is
 * settled by the DOM facts the page already gave, never by the name alone.
 */
export const elementKind = (
  role: string,
  facts: { readonly inputType: string | null },
): ElementKind => {
  const byType = facts.inputType === null ? undefined : ELEMENT_KIND_BY_INPUT_TYPE[facts.inputType];
  if (byType !== undefined) return byType;
  const typed = ELEMENT_KIND_WHEN_TYPED[role];
  return typed !== undefined && acceptsTypedText(facts.inputType) ? typed : elementKindOf(role);
};

/**
 * Whether an element is both typed into and chosen from: a role the role
 * table calls selectable, on a control that takes typed text — an input with
 * the combobox role, whose suggestions commit only when one is chosen. Its
 * kind stays what a hand does to it, typing; choosing is what a select on it
 * does. Measured 2026-10-30: a country field built so took typed words with
 * no choice, and the form cleared five fields on Next.
 */
export const choosesByTyping = (
  role: string,
  facts: { readonly inputType: string | null },
): boolean => elementKindOf(role) === 'selectable' && acceptsTypedText(facts.inputType);

/**
 * Whether a control typed into and chosen from holds words that none of its
 * whole list of options has: typed, never chosen, so it holds no answer to
 * keep or to give again. A list counted past its bound says nothing either
 * way, and a control chosen from alone — a native select, a radio group —
 * holds only what was chosen.
 */
export const holdsUnchosenWords = (field: {
  readonly role: string;
  readonly inputType: string | null;
  readonly value: string | null;
  readonly options: readonly string[] | null;
  readonly optionsOmitted: number;
}): boolean =>
  choosesByTyping(field.role, field) &&
  field.value !== null &&
  field.value !== '' &&
  field.options !== null &&
  field.optionsOmitted === 0 &&
  !field.options.includes(field.value);
