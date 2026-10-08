import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { bound } from './bound';
import { bounded } from './bounded';
import { boundPath, jsonSchemaBoundPath, locationPath } from './json-paths';
import { modelSchema } from './model-schema';
import { overrunsOf } from './overruns';

const CLAIM = bound(300);

describe('modelSchema', () => {
  const id = bounded.id(8, { min: 1 });
  const schema = z.strictObject({
    claim: bounded.text(CLAIM, { description: 'In your own words.' }),
    label: bounded.text(bound(80)).optional(),
    note: bounded.text(bound(80)).nullable(),
    tags: bounded.list(bound(6, 'list'), bounded.text(bound(40)), { min: 1 }).default([]),
    value: z.union([bounded.text(bound(120)), z.number(), z.boolean()]),
    // One node, three places: an index read off the conversion alone would miss two.
    edge: z.strictObject({ id, source: id, target: id.describe('Where it ends.') }),
  });

  it('[QL-58] asks the model for the target while the schema accepts the ceiling', () => {
    const { json, bounds } = modelSchema(schema);
    const properties = json['properties'] as Record<string, Record<string, unknown>>;
    expect(properties['claim']['maxLength']).toBe(300);
    expect(properties['claim']['description']).toBe('In your own words.');
    expect(properties['tags']['maxItems']).toBe(6);
    expect((properties['tags']['items'] as Record<string, unknown>)['maxLength']).toBe(40);
    expect(JSON.stringify(json)).not.toContain('$bound');

    const accepted = (claim: string) =>
      schema.safeParse({
        claim,
        note: null,
        value: 1,
        edge: { id: 'e1', source: 'n1', target: 'n2' },
      }).success;
    expect(accepted('x'.repeat(375))).toBe(true);
    expect(accepted('x'.repeat(376))).toBe(false);

    expect(bounds).toEqual({
      claim: { kind: 'text', target: 300, ceiling: 375 },
      label: { kind: 'text', target: 80, ceiling: 120 },
      note: { kind: 'text', target: 80, ceiling: 120 },
      tags: { kind: 'list', target: 6, ceiling: 8 },
      'tags[]': { kind: 'text', target: 40, ceiling: 80 },
      value: { kind: 'text', target: 120, ceiling: 160 },
      'edge.id': { kind: 'id', target: 8, ceiling: 8 },
      'edge.source': { kind: 'id', target: 8, ceiling: 8 },
      'edge.target': { kind: 'id', target: 8, ceiling: 8 },
    });
  });

  it('[QL-58] names a bound by its index-free path, and a value by its indices', () => {
    expect(boundPath(['findings', 2, 'rationale'])).toBe('findings[].rationale');
    expect(locationPath(['findings', 2, 'rationale'])).toBe('findings[2].rationale');
    expect(locationPath([])).toBe('(root)');
    expect(
      jsonSchemaBoundPath(['properties', 'findings', 'items', 'properties', 'rationale']),
    ).toBe('findings[].rationale');
    expect(jsonSchemaBoundPath(['properties', 'value', 'anyOf', 0])).toBe('value');
    expect(jsonSchemaBoundPath(['properties', 'config', 'additionalProperties'])).toBe('config.*');
  });

  it('[QL-58] reports every field of a value past its target', () => {
    const { bounds } = modelSchema(schema);
    const value = {
      claim: 'x'.repeat(358),
      note: null,
      tags: ['t'.repeat(50), 't'],
      value: 7,
      edge: { id: 'e1', source: 'n1', target: 'n2' },
    };
    expect(overrunsOf(value, bounds)).toEqual([
      {
        path: 'claim',
        at: ['claim'],
        kind: 'text',
        target: 300,
        ceiling: 375,
        actual: 358,
        handling: 'accepted',
      },
      {
        path: 'tags[0]',
        at: ['tags', 0],
        kind: 'text',
        target: 40,
        ceiling: 80,
        actual: 50,
        handling: 'accepted',
      },
    ]);
  });
});
