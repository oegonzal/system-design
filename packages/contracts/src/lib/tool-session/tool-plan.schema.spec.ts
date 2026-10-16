import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { keptAtMost } from '../bounds';
import { PROMPT_LIMITS } from '../notifications/interactions';
import {
  ASK_OPTION_BOUND,
  ASK_OPTIONS_BOUND,
  ASK_QUESTION_BOUND,
  toolPlanSchema,
  type ToolPlan,
} from './tool-plan.schema';

const plan: ToolPlan = {
  assessment: 'Nothing observed yet; the procedure begins by listing the items.',
  calls: [
    {
      tool: 'list_items',
      argumentsJson: '{"query":"","limit":null}',
      reason: 'the procedure begins with the list',
      expect: 'every item with whether it has a note',
      serves: ['c1'],
    },
  ],
  ask: null,
  finish: null,
};

describe('the tool plan a model writes', () => {
  it('[QL-72] is a closed shape: every key present, no key beyond them, arguments as text, and no number anywhere', () => {
    expect(toolPlanSchema.parse(plan)).toEqual(plan);
    expect(toolPlanSchema.safeParse({ ...plan, extra: true }).success).toBe(false);
    expect(toolPlanSchema.safeParse({ ...plan, ask: undefined }).success).toBe(false);
    expect(
      toolPlanSchema.safeParse({
        ...plan,
        calls: [{ ...plan.calls[0], argumentsJson: { query: '' } }],
      }).success,
    ).toBe(false);
    const written = JSON.stringify(z.toJSONSchema(toolPlanSchema));
    expect(written).not.toContain('"type":"number"');
    expect(written).not.toContain('"type":"integer"');
  });

  it('[QL-72] admits a plan that asks alone and one that finishes alone, and leaves the one-of rule to the validator', () => {
    const asks: ToolPlan = {
      ...plan,
      calls: [],
      ask: { question: 'Which item is the house account?', options: ['Alpha', 'Beta'] },
    };
    expect(toolPlanSchema.parse(asks)).toEqual(asks);
    const finishes: ToolPlan = {
      ...plan,
      calls: [],
      finish: { cause: 'nothing-left', detail: 'every listed item carries a note' },
    };
    expect(toolPlanSchema.parse(finishes)).toEqual(finishes);
    // Calls beside a closer is the validator's cut, located at the closer, never a schema refusal with no word of why.
    expect(toolPlanSchema.safeParse({ ...asks, calls: plan.calls }).success).toBe(true);
  });

  it('[QL-72] sizes a question and its options to the prompt the session forwards, so a lenient read never asks what the bus refuses', () => {
    expect(keptAtMost(ASK_QUESTION_BOUND)).toBeLessThanOrEqual(PROMPT_LIMITS.titleMaxLength);
    expect(keptAtMost(ASK_OPTION_BOUND)).toBeLessThanOrEqual(PROMPT_LIMITS.choiceLabelMaxLength);
    expect(ASK_OPTIONS_BOUND.ceiling).toBeLessThanOrEqual(PROMPT_LIMITS.choices);
  });
});
