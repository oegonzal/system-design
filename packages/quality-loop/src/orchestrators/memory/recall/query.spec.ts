import { describe, expect, it } from 'vitest';

import { LESSON_CHUNK_BOUND } from '@sysdesign/contracts';

import { renderGoal as renderQuery } from '../../../pipelines/memory-recall/input';
import { MAX_PROBES } from '../ports';
import { builtQuery, fused, GOAL as PROMPT, hitOf } from '../testing';
import { buildQuery, probeSet, probesOf, probeTexts, queryText, searchAlias } from './query';

describe('the recall query', () => {
  it('[QL-16] is the goal head under the byte cap, and a maximal query of the longest lessons still renders under the goal budget', () => {
    const long = 'x'.repeat(70_000);
    expect(Buffer.byteLength(queryText(long))).toBeLessThanOrEqual(16_000);
    const wide = Array.from({ length: 17 }, (_, index) =>
      hitOf('y'.repeat(LESSON_CHUNK_BOUND.ceiling), `run-${index}`, 'memory.1'),
    );
    const query = builtQuery(queryText(long), probeSet(long, []), fused(wide));
    expect(query.candidates).toHaveLength(16);
    expect(() => renderQuery(query)).not.toThrow();
  });

  it('[QL-41] a query the curator’s schema refuses is a diagnostic in the one wording, never a throw', () => {
    const stale = hitOf('y'.repeat(LESSON_CHUNK_BOUND.ceiling + 1), 'run-stale', 'memory.1');
    const built = buildQuery(queryText(PROMPT), probeSet(PROMPT, []), fused([stale]));
    expect(built.query).toBeNull();
    expect(built.issues.map((issue) => issue.path)).toEqual(['candidates[0].text']);
    expect(built.issues[0]).toMatchObject({
      code: 'too_big',
      target: LESSON_CHUNK_BOUND.target,
      maximum: LESSON_CHUNK_BOUND.ceiling,
      actual: LESSON_CHUNK_BOUND.ceiling + 1,
    });
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

describe('a probe set focused on the defects of an adopted iteration', () => {
  const defects = [
    'unhandled failure (high): no fallback on a cache outage',
    'c3 fail: lose no count',
  ];
  const derived = ['a latency budget crosses a vendor hop', defects[0]];

  it('[QL-34] searches the goal, then the defects, then the derived conditions — a repeat searched once', () => {
    const set = probeSet(PROMPT, derived, defects);
    expect(set.texts).toEqual([queryText(PROMPT), ...defects, derived[0]]);
    expect(set.focus).toEqual(defects);
    expect(set.derived).toEqual([derived[0]]);
    expect([0, 1, 2, 3].map((index) => searchAlias(set, index))).toEqual([null, 'd1', 'd2', 'p1']);
  });

  it('[QL-34] the curator’s query lists the defects and says which surfaced each candidate', () => {
    const set = probeSet(PROMPT, derived, defects);
    const [first, second] = fused(
      [
        hitOf('keep serving from the database', 'run-a', 'memory.1'),
        hitOf('x', 'run-b', 'memory.1'),
      ],
      [0, 1, 3],
    );
    const query = builtQuery(queryText(PROMPT), set, [first, { ...second, probes: [0] }]);
    expect(query.focus).toEqual(defects);
    expect(query.probes).toEqual([derived[0]]);
    expect(query.candidates.map((candidate) => candidate.matched)).toEqual([['d1', 'p1'], []]);
    const goal = renderQuery(query);
    expect(goal).toContain(`## What is wrong now`);
    expect(goal).toContain(`- [d1] ${defects[0]}`);
    expect(goal).toContain('Retrieved under d1, p1.');
  });
});
