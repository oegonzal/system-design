import { modelSchema } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { strictJsonSchema, strictSchemaFaults } from './strict-schema';

const bounded = z.strictObject({
  answer: z.string().max(400),
  tags: z.array(z.string().max(40)).max(6),
  score: z.number().int().min(0).max(10),
  note: z.string().nullable(),
});

describe('a schema a strict endpoint will accept', () => {
  it('[QL-62] keeps every structural demand strict mode makes, which this codebase meets by convention', () => {
    // Zero, because the output schemas are `strictObject` and say `.nullable()`
    // where another codebase would say `.optional()`.
    expect(strictSchemaFaults(strictJsonSchema(modelSchema(bounded).json))).toEqual([]);
  });

  it('[QL-62] names an optional property and an open object by the path the endpoint would refuse them at', () => {
    // The fault of 2026-10-07, as the schema then reached the endpoint: one
    // property left out of `required` inside a union branch under a list, and
    // every request was refused in under 200 ms.
    const action = (properties: Record<string, unknown>, required: string[]) => ({
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    });
    const asSent = {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: {
            anyOf: [
              action(
                { kind: { type: 'string' }, serves: { type: 'array', items: { type: 'string' } } },
                ['kind'],
              ),
              action({ kind: { type: 'string' } }, ['kind']),
            ],
          },
        },
        notes: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['actions', 'notes'],
      additionalProperties: false,
    };
    expect(strictSchemaFaults(asSent)).toEqual([
      'actions[]: serves is optional',
      'notes: open object',
    ]);
  });

  it('[QL-62] the same contract, converted for the model, has no fault left: what it leaves optional is shown required and nullable', () => {
    const plan = z.strictObject({
      actions: z.array(
        z.union([
          z.strictObject({ kind: z.literal('click'), serves: z.array(z.string()).optional() }),
          z.strictObject({ kind: z.literal('done') }),
        ]),
      ),
    });
    expect(strictSchemaFaults(strictJsonSchema(modelSchema(plan).json))).toEqual([]);
  });

  it('[QL-62] sends the declared bounds as they are, because the endpoint enforces them and a dropped one is a reply it cannot refuse', () => {
    const original = modelSchema(bounded).json;
    const before = JSON.stringify(original);
    const strict = strictJsonSchema(original);

    // Measured against both live endpoints: every one of these is accepted, so
    // stripping them only ever weakened what the endpoint would enforce. A
    // producer twice returned prose in a `ref` that `pattern` forbids.
    const json = JSON.stringify(strict);
    for (const keyword of ['maxLength', 'maxItems']) {
      expect(json, `the endpoint is never told: ${keyword}`).toContain(keyword);
    }

    // A deep copy: the schema the zod parse still enforces is untouched.
    expect(JSON.stringify(original)).toBe(before);
  });

  it('[QL-62] reads oneOf as anyOf, which is the one of the two the subset takes', () => {
    const either = z.union([z.strictObject({ a: z.string() }), z.strictObject({ b: z.string() })]);
    const strict = strictJsonSchema({ oneOf: modelSchema(either).json['anyOf'] ?? [] });
    expect(strict['oneOf']).toBeUndefined();
    expect(Array.isArray(strict['anyOf'])).toBe(true);
  });
});
