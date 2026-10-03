import { describe, expect, it } from 'vitest';

import { keptAtMost, LESSON_CHUNK_BOUND } from '@sysdesign/contracts';

import { GOAL_MAX_BYTES, goalBytes } from '../../../core/contracts';
import {
  KNOWN_HEADING,
  MAX_CANDIDATES,
  MAX_PROBES,
  NOVELTY_RULE,
  QUERY_MAX_BYTES,
  RECALL_RULES,
  recallRules,
  renderGoal as renderQuery,
} from '../../../pipelines/memory-recall/input';
import { builtQuery, fused, GOAL as PROMPT, hitOf } from '../testing';
import { buildQuery, probeSet, probesOf, probeTexts, queryText, searchAlias } from './query';

describe('the recall query', () => {
  it('[QL-16] is the goal head under the byte cap, and offers as many of the best-ranked lessons as the goal budget holds — every one when they are the length a digest asks for', () => {
    const long = 'x'.repeat(70_000);
    expect(Buffer.byteLength(queryText(long))).toBeLessThanOrEqual(QUERY_MAX_BYTES);
    const hitsOf = (length: number) =>
      fused(
        Array.from({ length: MAX_CANDIDATES + 1 }, (_, index) =>
          hitOf('y'.repeat(length), `run-${index}`, 'memory.1'),
        ),
      );

    const asked = builtQuery(
      queryText(long),
      probeSet(long, []),
      hitsOf(LESSON_CHUNK_BOUND.target),
    );
    expect(asked.candidates).toHaveLength(MAX_CANDIDATES);

    // The longest lessons the store holds: fewer, best-ranked first, and the query within the budget.
    const longest = builtQuery(
      queryText(long),
      probeSet(long, []),
      hitsOf(keptAtMost(LESSON_CHUNK_BOUND)),
    );
    expect(longest.candidates.length).toBeGreaterThan(1);
    expect(longest.candidates.length).toBeLessThan(MAX_CANDIDATES);
    expect(longest.candidates.map((candidate) => candidate.source.runId)).toEqual(
      Array.from({ length: longest.candidates.length }, (_, index) => `run-${index}`),
    );
    expect(goalBytes(renderQuery(longest))).toBeLessThanOrEqual(GOAL_MAX_BYTES);
  });

  it('[QL-58] the longest lesson the store holds is offered whole; only a structural fault refuses the query, in the one wording, never a throw', () => {
    const long = 'y'.repeat(keptAtMost(LESSON_CHUNK_BOUND));
    const kept = buildQuery(
      queryText(PROMPT),
      probeSet(PROMPT, []),
      fused([hitOf(long, 'run-long', 'memory.1')]),
    );
    expect(kept.issues).toEqual([]);
    expect(kept.query?.candidates[0].text).toBe(long);

    const stale = hitOf('a lesson stored under a decision no pipeline makes', 'run-stale', 'm.1');
    const broken = { ...stale, source: { ...stale.source, decision: 'maybe' as never } };
    const built = buildQuery(queryText(PROMPT), probeSet(PROMPT, []), fused([broken]));
    expect(built.query).toBeNull();
    expect(built.issues.map((issue) => [issue.path, issue.soft])).toEqual([
      ['candidates[0].source.decision', false],
    ]);
  });

  it('[QL-50] states what the producer holds, and the novelty rule, only beside something known; a screened candidate carries its origin', () => {
    const hits = fused([
      hitOf('keep serving from the database', 'run-a', 'memory.1'),
      hitOf('dedupe by event id', 'run-b', 'memory.1'),
    ]);
    const known = ['high · unhandled failure: no fallback on a cache outage'];
    const screened = builtQuery(
      queryText(PROMPT),
      probeSet(PROMPT, []),
      [
        { ...hits[0], origin: 'chain' },
        { ...hits[1], origin: 'same-pipeline' },
      ],
      known,
    );
    expect(screened.known).toEqual(known);
    expect(screened.rules).toEqual(recallRules(known));
    expect(screened.rules.at(-1)).toBe(NOVELTY_RULE);
    expect(screened.candidates.map((candidate) => candidate.origin)).toEqual([
      'chain',
      'same-pipeline',
    ]);

    // Unscreened: the query a recall over the goal alone has always composed.
    const bare = builtQuery(queryText(PROMPT), probeSet(PROMPT, []), hits);
    expect(bare.known).toEqual([]);
    expect(bare.rules).toEqual([...RECALL_RULES]);
    expect(bare.candidates.map((candidate) => candidate.origin)).toEqual([undefined, undefined]);
    expect(renderQuery(bare)).not.toContain(KNOWN_HEADING);
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
