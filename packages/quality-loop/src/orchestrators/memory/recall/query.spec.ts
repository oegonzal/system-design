import { describe, expect, it } from 'vitest';

import { renderGoal as renderQuery } from '../../../pipelines/memory-recall/input';
import { MAX_PROBES } from '../ports';
import { fused, hitOf } from '../testing';
import { buildQuery, probesOf, probeTexts, queryText } from './query';

describe('the recall query', () => {
  it('[QL-16] is the goal head under the byte cap, and a maximal query still renders under the goal budget', () => {
    const long = 'x'.repeat(70_000);
    expect(Buffer.byteLength(queryText(long))).toBeLessThanOrEqual(16_000);
    const wide = Array.from({ length: 17 }, (_, index) =>
      hitOf('y'.repeat(1_200), `run-${index}`, 'memory.1'),
    );
    const query = buildQuery(queryText(long), [queryText(long)], fused(wide));
    expect(query.candidates).toHaveLength(16);
    expect(() => renderQuery(query)).not.toThrow();
  });
});

describe('the probe set a recall searches under', () => {
  const GOAL = '# Prompt — serve an order history';

  it('puts the goal first, so the fused list can only add to a bare search', () => {
    expect(probeTexts(GOAL, ['a latency budget crosses a vendor hop'])).toEqual([
      queryText(GOAL),
      'a latency budget crosses a vendor hop',
    ]);
    expect(probeTexts(GOAL, [])).toEqual([queryText(GOAL)]);
  });

  it('drops blanks and repeats, because one empty probe nulls the whole batch', () => {
    const texts = probeTexts(GOAL, ['  ', '', 'a condition', 'a condition', '  a condition  ']);
    expect(texts).toEqual([queryText(GOAL), 'a condition']);
  });

  it('is bounded exactly, not greedily', () => {
    const many = Array.from({ length: MAX_PROBES * 3 }, (_, index) => `condition ${index}`);
    expect(probeTexts(GOAL, many)).toHaveLength(MAX_PROBES + 1);
  });

  it('asks every named vector, and lets the goal keep the budget the others share', () => {
    const vectors = [[1], [2], [3]];
    const probes = probesOf(vectors, 16);

    expect(probes).toHaveLength(6);
    expect(probes.map((probe) => probe.using)).toEqual([
      'condition',
      'lesson',
      'condition',
      'lesson',
      'condition',
      'lesson',
    ]);
    expect(probes.slice(0, 2).map((probe) => probe.limit)).toEqual([16, 16]);
    // The derived probes share the budget, so widening does not multiply the payload.
    expect(probes.slice(2).map((probe) => probe.limit)).toEqual([6, 6, 6, 6]);
  });
});
