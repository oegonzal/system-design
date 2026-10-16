import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { argumentFaults, canonicalArguments, parseArguments, sameArguments } from './arguments';
import { sampleTools } from './fixtures';

const parameters = (name: string) => {
  const tool = sampleTools().find((each) => each.name === name);
  if (tool === undefined) throw new Error(`no fixture tool ${name}`);
  return tool.parameters;
};

describe('a call’s arguments', () => {
  it('[QL-72] are one JSON object, or nothing', () => {
    expect(parseArguments('{"query":"a","limit":3}')).toEqual({ query: 'a', limit: 3 });
    expect(parseArguments('[1]')).toBeNull();
    expect(parseArguments('null')).toBeNull();
    expect(parseArguments('"text"')).toBeNull();
    expect(parseArguments('{not json')).toBeNull();
  });

  it('[QL-72] are held, shallowly, to the declared parameters: no undeclared key, every required key, each value of its declared type or among those enumerated', () => {
    const list = parameters('list_items');
    expect(argumentFaults({ query: 'a', limit: 3 }, list)).toEqual([]);
    expect(argumentFaults({ query: 'a', limit: null }, list)).toEqual([]);
    expect(argumentFaults({ query: 'a', limit: 2.5 }, list).map((fault) => fault.key)).toEqual([
      'limit',
    ]);
    expect(argumentFaults({ query: 1, limit: null }, list)[0]?.message).toContain('string');
    expect(argumentFaults({ query: 'a' }, list).map((fault) => fault.message)).toEqual([
      'limit is required and missing',
    ]);
    expect(argumentFaults({ query: 'a', limit: null, page: 2 }, list)[0]?.message).toContain(
      'page is not a parameter',
    );
    const choice = z.toJSONSchema(
      z.object({ mode: z.enum(['fast', 'slow']), tags: z.array(z.string()) }),
    ) as Record<string, unknown>;
    expect(argumentFaults({ mode: 'fast', tags: ['a'] }, choice)).toEqual([]);
    expect(argumentFaults({ mode: 'medium', tags: [] }, choice)[0]?.message).toContain(
      'not one of "fast", "slow"',
    );
    expect(argumentFaults({ mode: 'fast', tags: 'a' }, choice)[0]?.message).toContain('array');
    // A schema that declares no parameters admits none.
    expect(argumentFaults({ id: 'x' }, { type: 'object' })[0]?.message).toContain(
      'not a parameter',
    );
  });

  it('[QL-72] read the same whatever order the keys were written in, and two texts name the same call by that reading', () => {
    expect(canonicalArguments({ b: 1, a: { d: [2, { f: 1, e: 2 }], c: 3 } })).toBe(
      '{"a":{"c":3,"d":[2,{"e":2,"f":1}]},"b":1}',
    );
    expect(sameArguments('{"a":1,"b":2}', '{"b":2,"a":1}')).toBe(true);
    expect(sameArguments('{"a":1}', '{"a":2}')).toBe(false);
    expect(sameArguments('not json', 'not json')).toBe(true);
    expect(sameArguments('not json', '{"a":1}')).toBe(false);
  });
});
