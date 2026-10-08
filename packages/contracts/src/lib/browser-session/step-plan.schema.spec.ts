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

  it('[QL-36] carries every rule the validators enforce as a description the model reads', () => {
    const json = JSON.stringify(z.toJSONSchema(stepPlanSchema));
    for (const rule of [
      'exactly as the Elements list gives it',
      'A terminate or done action is last and appears nowhere else; a taskStart or taskDone comes before any action that could change the page.',
      'One of the options the Elements list gives for this ref, verbatim.',
    ]) {
      expect(json, `the model is never told: ${rule}`).toContain(rule);
    }
  });
});
