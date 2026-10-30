import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MEMORY_SCOPE,
  isUnitBound,
  MEMORY_SCOPE_USES,
  MEMORY_SCOPES,
  UNIT_BOUND_SCOPES,
} from './scope';

describe('where a memory holds', () => {
  it('[QL-71] which scopes bind a memory to a unit of work is one total table: unit does, subject does not, and a memory stored with no scope is bound to none', () => {
    expect(UNIT_BOUND_SCOPES).toEqual(['unit']);
    expect(MEMORY_SCOPES.map((scope) => [scope, isUnitBound(scope)])).toEqual([
      ['subject', false],
      ['unit', true],
    ]);
    expect(isUnitBound(undefined)).toBe(false);
    // Every scope has the use the legends state, and a memory written before scopes holds as one bound to no unit.
    expect(Object.keys(MEMORY_SCOPE_USES).sort()).toEqual([...MEMORY_SCOPES].sort());
    expect(isUnitBound(DEFAULT_MEMORY_SCOPE)).toBe(false);
  });
});
