import type { FieldSpec } from '@sysdesign/contracts';

import type { RoutedField } from './field-routing';
import { blanksOnPage, remembersBlank, type LeftBlank } from './left-blank';

const FORM = 'https://jobs.example.test/apply/42?step=2#contact';

const field = (overrides: Partial<FieldSpec> = {}): FieldSpec => ({
  ref: 'e353',
  role: 'textbox',
  name: 'Mobile Number',
  inputType: 'tel',
  options: null,
  optionsOmitted: 0,
  value: '+1',
  required: false,
  invalid: false,
  maxLength: null,
  hiddenTraits: [],
  context: 'Country code was added to the field. · Phone Number',
  ...overrides,
});

const routed = (spec: FieldSpec, decision: 'ask-operator' | 'leave-blank'): RoutedField => ({
  position: 0,
  field: spec,
  answer: {
    ref: spec.ref,
    about: 'subject',
    decision,
    value: null,
    rests: 'none',
    basis: [],
    reason: 'nothing on record',
  },
  route: 'leave-blank',
  value: null,
  source: 'loop',
  reason: 'optional, left blank',
  withheld: [],
  cached: false,
});

describe('a field left blank', () => {
  it('[BRW-3] is the same field when the page’s refusal adds its words around it, and asked again it is asked as required', () => {
    const leftBlank = new Map<string, LeftBlank>();
    blanksOnPage(leftBlank, FORM).remember(field(), 'session');
    // Measured 2026-11-06: the refusal's words joined the field's context; the key does not read them.
    const after = field({
      context: 'Country code was added to the field. Mobile Number is required. · Phone Number',
    });
    const other = field({ ref: 'e360', name: 'Home Number' });
    // The same page, its query and fragment moved on.
    const again = blanksOnPage(leftBlank, 'https://jobs.example.test/apply/42?step=3');
    expect(again.neededAgain([after, other]).map((f) => f.required)).toEqual([true, false]);
  });

  it('[BRW-3] is kept by the page it was seen on: the same ref, role and name on another page is another field', () => {
    const leftBlank = new Map<string, LeftBlank>();
    blanksOnPage(leftBlank, FORM).remember(field(), 'operator');
    const elsewhere = blanksOnPage(leftBlank, 'https://jobs.example.test/apply/43');
    expect(elsewhere.neededAgain([field()])[0]?.required).toBe(false);
    expect(elsewhere.blankedByOperator(field({ value: null }))).toBe(false);
  });

  it('[BRW-3] is remembered only when the page shows it and the answer did not choose the blank', () => {
    expect(remembersBlank(routed(field(), 'ask-operator'))).toBe(true);
    expect(remembersBlank(routed(field(), 'leave-blank'))).toBe(false);
    expect(remembersBlank(routed(field({ hiddenTraits: ['offscreen'] }), 'ask-operator'))).toBe(
      false,
    );
  });

  it('[BRW-3] by the operator’s own choice is their answer while the field reads as it did then: never written over by the session’s blank, and spent once a value is settled into it', () => {
    const blanks = blanksOnPage(new Map<string, LeftBlank>(), FORM);
    const asked = field({ value: null, required: true });
    blanks.remember(asked, 'operator');
    blanks.remember(asked, 'session');
    expect(blanks.blankedByOperator(asked)).toBe(true);
    // Filled in the browser since, it is a field like any other.
    expect(blanks.blankedByOperator(field({ value: '5550100', required: true }))).toBe(false);
    // What the page put there itself — a prefix, a box unticked — is what it read when the operator chose the blank.
    const prefilled = field({ ref: 'e354', value: '+1', required: true });
    blanks.remember(prefilled, 'operator');
    expect(blanks.blankedByOperator(prefilled)).toBe(true);
    expect(blanks.blankedByOperator({ ...prefilled, value: '+1 555 0100' })).toBe(false);
    // A value settled into it spends the blank; the field stays one the page needed.
    blanks.answered(asked);
    expect(blanks.blankedByOperator(asked)).toBe(false);
    expect(blanks.neededAgain([{ ...asked, required: false }])[0]?.required).toBe(true);
    // The session's own blank is not the operator's choice.
    const routedOnly = blanksOnPage(new Map<string, LeftBlank>(), FORM);
    routedOnly.remember(asked, 'session');
    expect(routedOnly.blankedByOperator(asked)).toBe(false);
  });
});
