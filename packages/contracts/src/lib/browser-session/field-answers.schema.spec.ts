import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MEMORY_SCOPES } from '../units/scope';
import { fieldAnswerSchema, type FieldAnswer } from './field-answers.schema';

const answer = (overrides: Partial<FieldAnswer> = {}): FieldAnswer => ({
  ref: 'e1',
  about: 'subject',
  decision: 'answer',
  value: '6',
  rests: 'stated',
  basis: ['m1'],
  reason: 'm1 states six years of Python',
  ...overrides,
});

describe('fieldAnswerSchema', () => {
  it('[QL-37] takes an answer only with the scope it declares the question holds in — one of the memory scopes, whatever the decision, never absent', () => {
    for (const about of MEMORY_SCOPES) {
      expect(fieldAnswerSchema.safeParse(answer({ about })).success).toBe(true);
    }
    // The scope is the question's, so a field the model could not settle declares it all the same.
    const asked = answer({
      about: 'unit',
      decision: 'ask-operator',
      value: null,
      rests: 'none',
      basis: [],
    });
    expect(fieldAnswerSchema.safeParse(asked).success).toBe(true);
    const { about, ...undeclared } = answer();
    void about;
    expect(fieldAnswerSchema.safeParse(undeclared).success).toBe(false);
    expect(fieldAnswerSchema.safeParse({ ...answer(), about: null }).success).toBe(false);
    expect(fieldAnswerSchema.safeParse({ ...answer(), about: 'everywhere' }).success).toBe(false);
  });

  it('[QL-37] tells the model the scope test where it writes the scope: the same whoever asks, or differing for another employer, role or application', () => {
    const json = JSON.stringify(z.toJSONSchema(fieldAnswerSchema));
    expect(json).toContain('"about"');
    expect(json).toContain('subject: the same whoever asks');
    expect(json).toContain('unit: it would differ for another employer, role or application');
  });
});
