import { UNIT_BOUND_SCOPES, type MemoryScope } from '@sysdesign/contracts';
import { textArrayLiteral } from '@sysdesign/pgvector-kit';
import { describe, expect, it } from 'vitest';

import type { ChunkKind, ProbeFilter } from '../../../orchestrators/memory/ports';
import { compileProbeFilter } from './filter';

/** How many `?` a clause carries: every one is a placeholder, so the count is the number of values it binds. */
const placeholders = (where: string): number => (where.match(/\?/g) ?? []).length;

const BOUND = `coalesce(payload->>'scope' = ANY(?::text[]), false)`;

/** Every shape a probe can declare, with and without a bound scope. */
const SHAPES: readonly [ProbeFilter | undefined, readonly MemoryScope[]][] = [
  [undefined, []],
  [{}, []],
  [{ kinds: [], pipelines: [], notRunIds: [] }, []],
  [{ kinds: ['fact', 'pattern'] }, []],
  [{ pipelines: ['knowledge-digest'] }, []],
  [{ notRunIds: ['r1', 'r2'] }, []],
  [{ kinds: ['profile_fact'], pipelines: ['document-digest'], notRunIds: ['r1'] }, []],
  [undefined, ['unit']],
  [{ kinds: ['profile_fact'], notRunIds: ['r1'] }, ['unit']],
  [{ unitKey: 'U' }, ['unit']],
  [{ unitKey: 'U' }, []],
  [{ kinds: ['lesson'], unitKey: 'company=acme' }, UNIT_BOUND_SCOPES],
];

describe('what the pgvector store asks of every search', () => {
  it('[QL-41] compiles each declared field to a clause over the payload, bound as a list, and an empty list or an absent field to none', () => {
    expect(compileProbeFilter(undefined, [])).toEqual({ where: 'true', params: [] });
    expect(compileProbeFilter({}, [])).toEqual({ where: 'true', params: [] });
    expect(compileProbeFilter({ kinds: [], pipelines: [], notRunIds: [] }, [])).toEqual({
      where: 'true',
      params: [],
    });
    expect(compileProbeFilter({ kinds: ['fact', 'pattern'] }, [])).toEqual({
      where: `payload->>'kind' = ANY(?::text[])`,
      params: ['{"fact","pattern"}'],
    });
    expect(compileProbeFilter({ pipelines: ['knowledge-digest'] }, [])).toEqual({
      where: `payload->>'pipeline' = ANY(?::text[])`,
      params: ['{"knowledge-digest"}'],
    });
    expect(compileProbeFilter({ notRunIds: ['r1', 'r2'] }, [])).toEqual({
      where: `NOT (payload->>'runId' = ANY(?::text[]))`,
      params: ['{"r1","r2"}'],
    });
    expect(
      compileProbeFilter(
        { kinds: ['profile_fact'], pipelines: ['document-digest'], notRunIds: ['r1'] },
        [],
      ),
    ).toEqual({
      where:
        `payload->>'kind' = ANY(?::text[]) AND payload->>'pipeline' = ANY(?::text[]) ` +
        `AND NOT (payload->>'runId' = ANY(?::text[]))`,
      params: ['{"profile_fact"}', '{"document-digest"}', '{"r1"}'],
    });
  });

  it('[QL-71] leaves out every memory bound to a unit of work unless the search names its unit — with no other filter, beside one, and two-valued so a memory with no scope is read', () => {
    expect(compileProbeFilter(undefined, ['unit'])).toEqual({
      where: `NOT ${BOUND}`,
      params: ['{"unit"}'],
    });
    expect(compileProbeFilter({ kinds: ['profile_fact'], notRunIds: ['r1'] }, ['unit'])).toEqual({
      where:
        `payload->>'kind' = ANY(?::text[]) AND NOT (payload->>'runId' = ANY(?::text[])) ` +
        `AND NOT ${BOUND}`,
      params: ['{"profile_fact"}', '{"r1"}', '{"unit"}'],
    });
    // Naming a unit: a bound memory of another unit, or of none, is left out; the named unit's own is read.
    expect(compileProbeFilter({ unitKey: 'U' }, ['unit'])).toEqual({
      where: `NOT (${BOUND} AND (payload->>'unitKey') IS DISTINCT FROM ?)`,
      params: ['{"unit"}', 'U'],
    });
    // The scopes the contracts bind are what the adapter passes, as one list.
    expect(compileProbeFilter({ unitKey: 'company=acme' }, UNIT_BOUND_SCOPES).params).toEqual([
      textArrayLiteral(UNIT_BOUND_SCOPES),
      'company=acme',
    ]);
  });

  it('[QL-71] states no clause when no scope is bound to a unit, whether or not the search names one', () => {
    expect(compileProbeFilter(undefined, [])).toEqual({ where: 'true', params: [] });
    expect(compileProbeFilter({ unitKey: 'U' }, [])).toEqual({ where: 'true', params: [] });
    expect(compileProbeFilter({ kinds: ['lesson'], unitKey: 'U' }, [])).toEqual({
      where: `payload->>'kind' = ANY(?::text[])`,
      params: ['{"lesson"}'],
    });
  });

  it('[QL-41] binds every value through a placeholder: each `?` in a clause is one, one per value, and no value reaches the clause text', () => {
    for (const [filter, scopes] of SHAPES) {
      const { where, params } = compileProbeFilter(filter, scopes);
      expect(placeholders(where), where).toBe(params.length);
    }
    // A value carrying a `?`, a quote or a backslash rides in a parameter, never in the text.
    const hostile = compileProbeFilter({ kinds: ["fa'ct?" as ChunkKind], unitKey: 'U"?\\' }, [
      'unit',
    ]);
    expect(placeholders(hostile.where)).toBe(hostile.params.length);
    expect(hostile.where).not.toMatch(/fa'ct|U"/);
    expect(hostile.params).toEqual([`{"fa'ct?"}`, '{"unit"}', 'U"?\\']);
  });
});
