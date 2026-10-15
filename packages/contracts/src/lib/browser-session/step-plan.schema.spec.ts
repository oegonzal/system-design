import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { modelSchema, parseLenient } from '../bounds';
import { STEP_ACTION_KINDS } from './action-effects';
import { ON_RECORD_TAKEN, stepActionSchema, stepPlanSchema } from './step-plan.schema';

type Json = Record<string, unknown>;

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
      "Each fact the mission's Unit identity declares, with its value exactly as this page names it; empty when the mission declares none.",
    ]) {
      expect(json, `the model is never told: ${meaning}`).toContain(meaning);
    }
    // One rule, one place: the order of a plan's claims is said in the Limits
    // (`step-limits.ts`), never again in the schema.
    expect(json).not.toContain('comes before any action that could change the page');
  });

  it('[BRW-13] a taskStart takes a unit on record to avoid by one declared key: absent unless the plan writes it true, shown to the model as required and nullable, and read back from null as absent', () => {
    const taskStart = {
      kind: 'taskStart',
      label: 'Senior Engineer at Acme',
      url: 'https://jobs.example.test/apply/42',
      facets: [{ name: 'company', value: 'Acme' }],
      reason: 'the listing is in the pane',
      expect: null,
      serves: [],
    };
    expect(stepActionSchema.parse(taskStart)).not.toHaveProperty(ON_RECORD_TAKEN);
    expect(stepActionSchema.parse({ ...taskStart, [ON_RECORD_TAKEN]: true })).toHaveProperty(
      ON_RECORD_TAKEN,
      true,
    );
    expect(stepActionSchema.safeParse({ ...taskStart, [ON_RECORD_TAKEN]: 'yes' }).success).toBe(
      false,
    );
    // Shown as every optional key is (`modelSchema`): a strict endpoint takes
    // no optional property, and refused one here on every call of a session.
    const shown = modelSchema(stepPlanSchema).json;
    const actions = (shown['properties'] as Record<string, Json>)['actions'];
    const variants = (actions['items'] as Json)['oneOf'] as Json[];
    const variant = variants.find(
      (candidate) =>
        (candidate['properties'] as Record<string, Json>)['kind']['const'] === 'taskStart',
    );
    expect(variant?.['required']).toContain(ON_RECORD_TAKEN);
    expect((variant?.['properties'] as Record<string, Json>)[ON_RECORD_TAKEN]).toEqual({
      anyOf: [
        { type: 'boolean', description: expect.stringContaining('on record to avoid') },
        { type: 'null' },
      ],
    });
    const read = parseLenient(stepPlanSchema, {
      assessment: 'the listing is in the pane',
      actions: [{ ...taskStart, [ON_RECORD_TAKEN]: null }],
    });
    expect(read.ok).toBe(true);
    expect(read.value?.actions[0]).not.toHaveProperty(ON_RECORD_TAKEN);
  });
});
