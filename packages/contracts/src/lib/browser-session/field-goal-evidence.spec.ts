import { describe, expect, it } from 'vitest';

import { FIELDS_BOUND } from './field-answers.schema';
import { fieldQuestionOf, MAX_EVIDENCE, type FieldSpec } from './field-goal';
import {
  dealByRank,
  fieldProbes,
  hitsFor,
  MAX_FIELD_PROBES,
  type HitsPerFieldType,
} from './field-goal-evidence';
import { FIELD_TYPES } from './vocab';

/** A recall's policy as a spec declares it: a free-text field draws deeper than a control that takes one value. */
const BUDGETS: HitsPerFieldType = {
  text: 3,
  textarea: 10,
  number: 3,
  date: 3,
  select: 3,
  radio: 3,
  checkbox: 3,
  file: 3,
  unknown: 3,
};

const field = (
  ref: string,
  name: string,
  context: string | null = null,
  inputType: string | null = null,
): FieldSpec => ({
  ref,
  role: 'textbox',
  name,
  inputType,
  options: null,
  optionsOmitted: 0,
  value: null,
  required: false,
  invalid: false,
  maxLength: null,
  hiddenTraits: [],
  context,
});

/** A ranked item as any store might hand one back, identified by what it says. */
const item = (text: string): { text: string } => ({ text });
const identity = (hit: { text: string }): string => hit.text;

describe('the form evidence helpers', () => {
  it('[QL-38] what a field asks is its probe — the label, then the help text beside it, the one key its taught answer is written under — fields asking the same thing share one, and a page has at most as many probes as the fields it is asked for', () => {
    expect(
      fieldQuestionOf(field('e1', '  Years of  experience ', 'Whole years,\nprofessional only.')),
    ).toBe('Years of experience. Whole years, professional only.');
    expect(fieldQuestionOf(field('e2', 'Work authorisation'))).toBe('Work authorisation');
    expect(fieldQuestionOf(field('e5', '', 'Do you reside in the country?'))).toBe(
      'Do you reside in the country?',
    );
    expect(fieldQuestionOf(field('e6', '   '))).toBeNull();
    const probes = fieldProbes(
      [field('e1', 'City'), field('e2', 'Country'), field('e3', 'City'), field('e4', '   ')],
      BUDGETS,
    );
    expect(probes).toEqual({
      texts: ['City', 'Country'],
      byField: [0, 1, 0, null],
      limits: [3, 3],
    });
    expect(MAX_FIELD_PROBES).toBe(FIELDS_BOUND.target);
    const many = fieldProbes(
      Array.from({ length: MAX_FIELD_PROBES + 2 }, (_, index) => field(`e${index}`, `q${index}`)),
      BUDGETS,
    );
    expect(many.texts).toHaveLength(MAX_FIELD_PROBES);
    expect(many.byField.slice(-2)).toEqual([null, null]);
  });

  it('[QL-70] a probe takes as many hits as the kind of control asking it, by the table the caller declares over every field type: a free-text field draws deeper than a control that takes one value, and a question two controls share takes the deeper budget', () => {
    expect(hitsFor(field('e1', 'Cover letter', null, 'textarea'), BUDGETS)).toBe(10);
    expect(hitsFor(field('e2', 'City'), BUDGETS)).toBe(3);
    expect(hitsFor({ role: 'radiogroup', inputType: null }, BUDGETS)).toBe(3);
    // The table is total over the declared field types — a new kind is a build error, never a silent default.
    expect(Object.keys(BUDGETS).sort()).toEqual([...FIELD_TYPES].sort());
    const probes = fieldProbes(
      [
        field('e1', 'Tell us about yourself', null, 'textarea'),
        field('e2', 'City'),
        field('e3', 'City', null, 'textarea'),
      ],
      BUDGETS,
    );
    expect(probes).toEqual({
      texts: ['Tell us about yourself', 'City'],
      byField: [0, 1, 1],
      limits: [10, 10],
    });
  });

  it('[QL-38] each field’s ranked list is dealt out by rank — every field’s best before any field’s second — one slot per distinct item, under a cap', () => {
    const a = item('six years of Python');
    const b = item('authorised to work');
    const c = item('lives in Lisbon');
    // Field 1 ranks b then a; field 2 ranks c, then a again.
    expect(
      dealByRank(
        [
          [b, a],
          [c, a],
        ],
        identity,
      ),
    ).toEqual([b, c, a]);
    expect(
      dealByRank(
        [
          [b, a],
          [c, a],
        ],
        identity,
        2,
      ),
    ).toEqual([b, c]);
    expect(MAX_EVIDENCE).toBe(24);
    // A field with nothing ranked contributes nothing; an empty search is empty evidence.
    expect(dealByRank([[], [c]], identity)).toEqual([c]);
    expect(dealByRank([], identity)).toEqual([]);
  });

  it('[QL-70] a free-text field is dealt as deep as its list runs once every field has its first item', () => {
    const stories = Array.from({ length: BUDGETS.textarea }, (_, rank) =>
      item(`story part ${rank + 1}`),
    );
    const city = item('lives in Lisbon');
    expect(dealByRank([stories, [city]], identity).map(identity)).toEqual([
      'story part 1',
      city.text,
      ...stories.slice(1).map(identity),
    ]);
  });

  it('[QL-38] a long page never starves its last fields: eleven fields of three distinct items each under the cap of 24 give every field its best and at least two', () => {
    // Measured 2026-10-10: an eleven-field page joined field by field spent
    // the cap before its last field, and that question was asked with none.
    const count = 11;
    const perField = Array.from({ length: count }, (_, index) =>
      [1, 2, 3].map((rank) => item(`fact ${rank} for question ${index}`)),
    );
    const chosen = dealByRank(perField, identity);
    expect(chosen).toHaveLength(MAX_EVIDENCE);
    // Eleven bests, eleven seconds, then the cap's last two slots to the first fields' thirds.
    expect(perField.map((items) => items.filter((it) => chosen.includes(it)).length)).toEqual([
      3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    ]);
    // Every field's best is in, the last field's included.
    expect(chosen.slice(0, count).map(identity)).toEqual(
      perField.map((_, index) => `fact 1 for question ${index}`),
    );
  });
});
