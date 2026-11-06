import type { FieldSpec } from '@sysdesign/contracts';

import type { RoutedField } from './field-routing';
import { leftBlankKeyOf, neededAgain, remembersBlank } from './left-blank';

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

describe('a field this session left blank', () => {
  it('[BRW-3] is the same field when the page’s refusal adds its words around it, and asked again it is asked as required', () => {
    const before = field();
    // Measured 2026-11-06: the refusal's words joined the field's context; the key does not read them.
    const after = field({
      context: 'Country code was added to the field. Mobile Number is required. · Phone Number',
    });
    expect(leftBlankKeyOf(after)).toBe(leftBlankKeyOf(before));
    const leftBlank = new Map([[leftBlankKeyOf(before), '']]);
    const other = field({ ref: 'e360', name: 'Home Number' });
    expect(neededAgain([after, other], leftBlank).map((f) => f.required)).toEqual([true, false]);
  });

  it('[BRW-3] is remembered only when the page shows it and the answer did not choose the blank', () => {
    expect(remembersBlank(routed(field(), 'ask-operator'))).toBe(true);
    expect(remembersBlank(routed(field(), 'leave-blank'))).toBe(false);
    expect(remembersBlank(routed(field({ hiddenTraits: ['offscreen'] }), 'ask-operator'))).toBe(
      false,
    );
  });
});
