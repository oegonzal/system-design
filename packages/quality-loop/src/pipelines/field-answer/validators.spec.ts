import type { FieldAnswers } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { contractOf, fill } from '../../core/testing';
import { FIELD_ANSWER } from './definition';
import { answer, fieldGoal, sampleAnswers, sampleFields } from './testing';
import { limitsValidator, referencesValidator } from './validators';

const goal = fieldGoal();

const problems = (answers: FieldAnswers, goalIn = goal) => {
  const contract = contractOf(FIELD_ANSWER.task, goalIn);
  return {
    references: referencesValidator.validate(answers, contract).problems,
    limits: limitsValidator.validate(answers, contract).problems,
  };
};

/** The sample with one answer replaced, by ref. */
const withAnswer = (ref: string, replacement: ReturnType<typeof answer>): FieldAnswers => {
  const sample = sampleAnswers();
  return {
    ...sample,
    fields: sample.fields.map((item) => (item.ref === ref ? replacement : item)),
  };
};

describe('the field-answer validators', () => {
  it('[QL-37] a page answered once per field over listed evidence passes both; references block and limits warn', () => {
    expect(problems(sampleAnswers())).toEqual({ references: [], limits: [] });
    expect(referencesValidator.gate).toBe('block');
    expect(limitsValidator.gate).toBe('warn');
    expect(
      limitsValidator.validate(sampleAnswers(), contractOf(FIELD_ANSWER.task, goal)).gate,
    ).toBe('warn');
  });

  it('[QL-37] a field answered twice, a field left out, a field never listed and an alias never listed block, each located', () => {
    const sample = sampleAnswers();
    const twice = { ...sample, fields: [...sample.fields, answer('e1', { value: '7' })] };
    expect(problems(twice).references).toEqual([
      { severity: 'critical', locationRefs: ['field.6'], message: 'e1 is answered more than once' },
    ]);
    const missing = { ...sample, fields: sample.fields.slice(0, 4) };
    expect(problems(missing).references).toEqual([
      { severity: 'critical', locationRefs: [], message: 'e5 is not answered' },
    ]);
    const unlisted = { ...sample, fields: [...sample.fields, answer('e9', { value: 'x' })] };
    expect(problems(unlisted).references).toEqual([
      { severity: 'critical', locationRefs: ['field.6'], message: 'e9 is not a listed field' },
    ]);
    // Nothing to check a never-listed field's value against; the references rule owns it.
    expect(problems(unlisted).limits).toEqual([]);
    const alias = withAnswer('e1', answer('e1', { value: '6', basis: ['m1', 'm7'] }));
    expect(problems(alias).references).toEqual([
      { severity: 'critical', locationRefs: ['field.1'], message: 'm7 is not listed evidence' },
    ]);
  });

  it('[QL-37] a value is present iff the decision is answer', () => {
    expect(problems(withAnswer('e1', answer('e1', { basis: ['m1'] }))).limits).toEqual([
      { severity: 'medium', locationRefs: ['field.1'], message: 'e1 is answered with no value' },
    ]);
    expect(
      problems(
        withAnswer('e3', answer('e3', { decision: 'ask-operator', rests: 'none', value: 'Acme' })),
      ).limits,
    ).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.3'],
        message: 'e3 carries a value although the decision is ask-operator',
      },
    ]);
  });

  it('[QL-37] a value the field cannot take is a warning located at its field: length, option, number', () => {
    expect(
      problems(withAnswer('e5', answer('e5', { value: fill(201), basis: ['m1'] }))).limits,
    ).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.5'],
        message: 'e5 takes at most 200 characters; the value runs to 201',
      },
    ]);
    expect(
      problems(withAnswer('e2', answer('e2', { value: 'Maybe', basis: ['m2'] }))).limits,
    ).toEqual([
      { severity: 'medium', locationRefs: ['field.2'], message: '"Maybe" is not an option of e2' },
    ]);
    expect(
      problems(withAnswer('e1', answer('e1', { value: 'six', basis: ['m1'] }))).limits,
    ).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.1'],
        message: 'e1 takes a number; "six" is not one',
      },
    ]);
    expect(
      problems(withAnswer('e1', answer('e1', { value: ' 6 ', basis: ['m1'] }))).limits,
    ).toEqual([]);
  });

  it('[QL-37] a value past a counted cut of the options is not a warning: the page offers more than the list shows', () => {
    const counted = fieldGoal(
      undefined,
      sampleFields().map((field) =>
        field.ref === 'e2' ? { ...field, optionsOmitted: 190 } : field,
      ),
    );
    expect(
      problems(withAnswer('e2', answer('e2', { value: 'Maybe', basis: ['m2'] })), counted).limits,
    ).toEqual([]);
  });

  it('[QL-37] a hidden field given a value warns high, and a required visible field left blank warns', () => {
    expect(
      problems(withAnswer('e4', answer('e4', { value: 'https://alex.example', basis: ['m1'] })))
        .limits,
    ).toEqual([
      {
        severity: 'high',
        locationRefs: ['field.4'],
        message:
          'e4 is hidden (offscreen, autocomplete-off-bait); a field the page hides is given no value',
      },
    ]);
    expect(
      problems(
        withAnswer(
          'e2',
          answer('e2', { decision: 'leave-blank', rests: 'none', reason: 'unsure' }),
        ),
      ).limits,
    ).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.2'],
        message: 'e2 is required and visible, yet left blank',
      },
    ]);
    // The hidden field is the one field blank is right for, required or not.
    expect(problems(sampleAnswers()).limits).toEqual([]);
  });

  it('[QL-68] how a value rests is declared data the read-back routes by, so a declaration the answer contradicts is a located warning: a value resting on nothing, a kind citing no evidence, a mapping with no options, a kind on a decision that fills nothing', () => {
    expect(problems(withAnswer('e1', answer('e1', { value: '6', rests: 'none' }))).limits).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.1'],
        message: 'e1 is answered with a value resting on nothing',
      },
    ]);
    expect(
      problems(withAnswer('e1', answer('e1', { value: '6', rests: 'restated' }))).limits,
    ).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.1'],
        message: 'e1 rests restated on the evidence yet cites none',
      },
    ]);
    // A policy value rests on the Answering policy, not on the evidence: no citation is owed.
    expect(
      problems(withAnswer('e1', answer('e1', { value: '6', rests: 'policy' }))).limits,
    ).toEqual([]);
    expect(
      problems(withAnswer('e1', answer('e1', { value: '6', rests: 'mapped', basis: ['m1'] })))
        .limits,
    ).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.1'],
        message: 'e1 is mapped yet offers no options',
      },
    ]);
    expect(
      problems(withAnswer('e2', answer('e2', { value: 'Yes', rests: 'mapped', basis: ['m2'] })))
        .limits,
    ).toEqual([]);
    expect(
      problems(withAnswer('e3', answer('e3', { decision: 'ask-operator', rests: 'inferred' })))
        .limits,
    ).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.3'],
        message: 'e3 declares how a value rests although the decision is ask-operator',
      },
    ]);
  });

  it('[QL-37] a goal without an index blocks once; an ill-formed artifact is left to the schema validator', () => {
    expect(problems(sampleAnswers(), 'Just a policy.')).toEqual({
      references: [
        {
          severity: 'critical',
          locationRefs: [],
          message: 'the goal carries no field-answer index',
        },
      ],
      limits: [],
    });
    const broken = { summary: 'x' } as unknown as FieldAnswers;
    expect(problems(broken)).toEqual({ references: [], limits: [] });
  });
});
