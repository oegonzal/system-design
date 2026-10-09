import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { STEP_ACTION_KINDS } from './action-effects';
import { stepActionSchema, stepPlanSchema } from './step-plan.schema';

describe('stepPlanSchema', () => {
  it('[QL-36] is a closed vocabulary of actions, the same one the records use, with no number a model writes', () => {
    const kinds = stepActionSchema.options.map((option) => option.shape.kind.value);
    expect([...kinds].sort()).toEqual([...STEP_ACTION_KINDS].sort());
    const json = JSON.stringify(z.toJSONSchema(stepPlanSchema));
    expect(json).not.toMatch(/"type":"(number|integer)"/);
  });

  it("[QL-36] says what each field means where the model reads it, and leaves the order a plan takes to the goal's Limits", () => {
    const json = JSON.stringify(z.toJSONSchema(stepPlanSchema));
    for (const meaning of [
      'exactly as the Elements list gives it',
      'One of the options the Elements list gives for this ref, verbatim.',
    ]) {
      expect(json, `the model is never told: ${meaning}`).toContain(meaning);
    }
    // One rule, one place: the order of a plan's claims is said in the Limits
    // (`step-limits.ts`), never again in the schema.
    expect(json).not.toContain('comes before any action that could change the page');
  });
});
