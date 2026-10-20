import { CANVAS_CRITERION_KINDS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { makeCriteria } from '../../testing/fixtures';
import { groupCriteriaByKind, humanizeKind } from './criteria';

describe('groupCriteriaByKind', () => {
  it('[UX-14] groups in the contract’s order, skipping the kinds no criterion carries', () => {
    const criteria = makeCriteria();
    const groups = groupCriteriaByKind([...criteria].reverse());
    expect(groups.map((group) => group.kind)).toEqual(
      CANVAS_CRITERION_KINDS.filter((kind) =>
        criteria.some((criterion) => criterion.kind === kind),
      ),
    );
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
  it('reads a canvas kind by the contract’s label, and any other kind by its words', () => {
    expect(humanizeKind('non_functional')).toBe('Non-functional');
    expect(humanizeKind('scale')).toBe('Scale');
    expect(humanizeKind('data_fidelity')).toBe('Data fidelity');
  });
});
