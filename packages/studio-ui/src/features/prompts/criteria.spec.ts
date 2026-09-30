import { describe, expect, it } from 'vitest';

import { makeCriteria } from '../../testing/fixtures';
import { groupCriteriaByKind, humanizeKind, KNOWN_CRITERION_KINDS } from './criteria';

describe('groupCriteriaByKind', () => {
  it('[UX-14] groups in the known order — functional, non-functional, scale, constraint', () => {
    const groups = groupCriteriaByKind([...makeCriteria()].reverse());
    expect(groups.map((group) => group.kind)).toEqual(KNOWN_CRITERION_KINDS);
    expect(groups[0].criteria.map((criterion) => criterion.id)).toEqual(['c2', 'c1']);
  });

  it('omits kinds with no criteria and appends unknown kinds in first-seen order', () => {
    const groups = groupCriteriaByKind([
      { id: 'c1', kind: 'scope', statement: 'brand-neutral' },
      { id: 'c2', kind: 'constraint', statement: 'webhook only' },
      { id: 'c3', kind: 'fidelity', statement: 'rests on a real figure' },
      { id: 'c4', kind: 'scope', statement: "one session's worth" },
    ]);
    expect(groups.map((group) => group.kind)).toEqual(['constraint', 'scope', 'fidelity']);
    expect(groups[1].criteria.map((criterion) => criterion.id)).toEqual(['c1', 'c4']);
  });

  it('is empty for no criteria', () => {
    expect(groupCriteriaByKind([])).toEqual([]);
  });
});

describe('humanizeKind', () => {
  it('reads a kind token as a heading', () => {
    expect(humanizeKind('non_functional')).toBe('Non functional');
    expect(humanizeKind('scale')).toBe('Scale');
  });
});
