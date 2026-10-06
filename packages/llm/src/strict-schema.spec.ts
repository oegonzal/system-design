import { modelSchema, walkJsonSchema } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { strictJsonSchema } from './strict-schema';

const bounded = z.strictObject({
  answer: z.string().max(400),
  tags: z.array(z.string().max(40)).max(6),
  score: z.number().int().min(0).max(10),
  note: z.string().nullable(),
});

describe('a schema a strict endpoint will accept', () => {
  it('[QL-62] keeps every structural demand strict mode makes, which this codebase already meets', () => {
    const strict = strictJsonSchema(modelSchema(bounded).json);
    const faults: string[] = [];
    walkJsonSchema(strict, '', (node, path) => {
      if (node['type'] !== 'object' && node['properties'] === undefined) return;
      if (node['additionalProperties'] !== false) faults.push(`${path}: open object`);
      const properties = Object.keys((node['properties'] as object) ?? {});
      const required = new Set((node['required'] as string[]) ?? []);
      for (const key of properties) if (!required.has(key)) faults.push(`${path}.${key}: optional`);
    });
    // Zero, because the output schemas are `strictObject` and say `.nullable()`
    // where another codebase would say `.optional()`.
    expect(faults).toEqual([]);
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
