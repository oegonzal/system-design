import { describe, expect, it } from 'vitest';

import {
  acceptsTypedText,
  choosesByTyping,
  holdsUnchosenWords,
  ELEMENT_KIND_BY_ROLE,
  ELEMENT_KIND_WHEN_TYPED,
  elementKind,
  elementKindOf,
  NON_TEXT_INPUT_TYPES,
} from './element-kind';

describe('what an element affords', () => {
  it('[BRW-27] names a control both typed into and chosen from by its role and the control beneath it, never by its name', () => {
    // An input with the combobox role: typed into, and committed by a choice.
    expect(choosesByTyping('combobox', { inputType: 'search' })).toBe(true);
    expect(choosesByTyping('combobox', { inputType: 'text' })).toBe(true);
    expect(choosesByTyping('combobox', { inputType: 'textarea' })).toBe(true);
    // A combobox on no typed control, or on a native select, is chosen from alone.
    expect(choosesByTyping('combobox', { inputType: null })).toBe(false);
    expect(choosesByTyping('combobox', { inputType: 'select' })).toBe(false);
    // A role typed into that offers no choice, and a choice no one types into, are neither.
    expect(choosesByTyping('textbox', { inputType: 'text' })).toBe(false);
    expect(choosesByTyping('radio', { inputType: 'radio' })).toBe(false);
  });

  it('[BRW-27] reads words typed into a chooser that none of its whole list has as no answer — and a control chosen from alone as holding what was chosen', () => {
    const typed = {
      role: 'combobox',
      inputType: 'search',
      value: 'United States',
      options: ['United States Minor Outlying Islands', 'United States of America'],
      optionsOmitted: 0,
    };
    expect(holdsUnchosenWords(typed)).toBe(true);
    expect(holdsUnchosenWords({ ...typed, value: 'United States of America' })).toBe(false);
    // A list counted past its bound says nothing either way; nothing held is nothing unchosen.
    expect(holdsUnchosenWords({ ...typed, optionsOmitted: 3 })).toBe(false);
    expect(holdsUnchosenWords({ ...typed, value: null })).toBe(false);
    // A native select or a radio group holds only what was chosen, its option text cut or not.
    expect(holdsUnchosenWords({ ...typed, inputType: 'select' })).toBe(false);
    expect(holdsUnchosenWords({ ...typed, role: 'radiogroup', inputType: null })).toBe(false);
  });

  it('[BRW-2] settles an ambiguous role by the control beneath it, and leaves every unambiguous role to the table', () => {
    // The live case: a site's search box is a textarea the author gave the
    // combobox role. Read from the role alone it is `selectable`, which makes
    // `fill` on it an invalid action and strands the plan that types a query.
    expect(elementKind('combobox', { inputType: 'textarea' })).toBe('fillable');
    expect(elementKind('combobox', { inputType: 'text' })).toBe('fillable');
    // The same role on a control with nothing to type into stays a dropdown.
    expect(elementKind('combobox', { inputType: null })).toBe('selectable');
    expect(elementKind('combobox', { inputType: 'select' })).toBe('selectable');

    // An unambiguous role is the role table's to decide, facts or no facts: a
    // listbox is chosen from however it is built, and a textbox is typed into.
    for (const [role, kind] of Object.entries(ELEMENT_KIND_BY_ROLE)) {
      if (role in ELEMENT_KIND_WHEN_TYPED) continue;
      expect(elementKind(role, { inputType: 'textarea' })).toBe(kind);
      expect(elementKind(role, { inputType: null })).toBe(kind);
    }
    // A role neither table names affords nothing.
    expect(elementKind('paragraph', { inputType: 'text' })).toBe('static');
  });

  it('[BRW-2] names the input types that are not typed into, so a type HTML adds later is fillable rather than silently inert', () => {
    for (const type of NON_TEXT_INPUT_TYPES) expect(acceptsTypedText(type)).toBe(false);
    // Open-ended by design: these are not listed anywhere and must still type.
    for (const type of ['text', 'search', 'email', 'tel', 'url', 'password', 'date', 'textarea']) {
      expect(acceptsTypedText(type)).toBe(true);
    }
    // No control underneath is not a control that takes text.
    expect(acceptsTypedText(null)).toBe(false);
  });

  it('[BRW-2] keeps the role-only reading available, because the observer filters static nodes before it has read any facts', () => {
    expect(elementKindOf('combobox')).toBe('selectable');
    expect(elementKindOf('paragraph')).toBe('static');
    // Whatever the facts say, an ambiguous role is never static — so the
    // pre-filter that runs on the role alone cannot drop an element the
    // facts would later have called fillable.
    for (const role of Object.keys(ELEMENT_KIND_WHEN_TYPED)) {
      expect(elementKindOf(role)).not.toBe('static');
    }
  });
});
