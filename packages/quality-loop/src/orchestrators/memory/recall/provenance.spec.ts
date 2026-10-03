import type { RecallFocusDto, SuccessCriterion } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { briefingOf } from '../../../modules/runs/recall/run-recall';
import { focusAlias, MAX_FOCUS } from '../../../pipelines/memory-recall/input';
import { hitOf } from '../testing';
import { askerTermsOf, inAskerTerms, lessonOf, provenanceOf } from './provenance';
import type { UsableMemory } from './read-pack';

/**
 * The focus of the measured round (recall 18eb29): five defects, then three
 * criteria the starting grade fell short on — the curator read them as d1…d8.
 */
const FOCUS: RecallFocusDto = {
  runId: 'grade-run',
  iteration: 4,
  findings: [
    { type: 'unbacked_claim', severity: 'critical', rationale: 'promotion repoints writes' },
    { type: 'unhandled_failure', severity: 'critical', rationale: 'edge.8 is synchronous' },
    { type: 'scale_mismatch', severity: 'high', rationale: 'one viral link' },
    { type: 'contradiction', severity: 'high', rationale: 'no contention, yet a sync hop' },
    { type: 'bad_assumption', severity: 'medium', rationale: 'one failure per month' },
  ],
  criteria: [
    {
      criterionId: 'c5',
      statement: 'Redirect availability must be 99.95% monthly.',
      result: 'fail',
    },
    {
      criterionId: 'c2',
      statement: 'Anyone opening a short link is redirected.',
      result: 'partial',
    },
    {
      criterionId: 'c3',
      statement: 'Click counts lag by no more than 5 minutes.',
      result: 'partial',
    },
  ],
};

/** The recall run's own rubric: one need per focus line, as its deriver wrote them, then its own. */
const RUBRIC: SuccessCriterion[] = [
  ...['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'].map((label, position) => ({
    id: `c${position + 1}`,
    kind: 'need',
    statement: `${label}: what the design must show for this defect.`,
  })),
  { id: 'c9', kind: 'need', statement: 'Constraint: a short link never changes its target.' },
  { id: 'c10', kind: 'admissibility', statement: 'Keep a chunk only for what its text says.' },
];

const terms = askerTermsOf(FOCUS, RUBRIC);

describe('a recalled lesson in the asker’s terms', () => {
  it('[QL-55] reads each curator label back as the criterion or defect it stands for, and drops the rest', () => {
    // A criterion the grade fell short on is the asker's own id; a defect, its words.
    expect(terms.get('d6')).toEqual(['c5']);
    expect(terms.get('d2')).toEqual(['unhandled failure']);
    // The curator's own need is what the focus label its statement cites stands for.
    expect(terms.get('c6')).toEqual(['c5']);
    expect(terms.get('c8')).toEqual(['c3']);
    // A need it derived from the prompt alone, a probe and a held note stand for nothing here.
    expect(terms.get('c9')).toEqual([]);
    expect(terms.get('p1')).toEqual([]);
    expect(terms.get('k1')).toEqual([]);

    // The measured `serves`, as the producer and the panel now read them.
    expect(
      inAskerTerms('d6/c6 — recomputing availability numbers instead of asserting them', terms),
    ).toBe('c5 — recomputing availability numbers instead of asserting them');
    expect(
      inAskerTerms(
        'd2/c2 — undefined redirect behavior when the synchronous ack-required enqueue fails',
        terms,
      ),
    ).toBe(
      'unhandled failure — undefined redirect behavior when the synchronous ack-required enqueue fails',
    );
    expect(inAskerTerms('d8/c8 (freshness) and c9 (immutability constraint)', terms)).toBe(
      'c3 (freshness) and (immutability constraint)',
    );
    // A recall with no focus: the curator's own ids stand for nothing, and only its words remain.
    expect(
      inAskerTerms('c2 — embedding-provider budget at 50 peak qps', askerTermsOf(null, RUBRIC)),
    ).toBe('embedding-provider budget at 50 peak qps');
    // A focus label is a label on it too, up to as many as a query can list.
    const unfocused = askerTermsOf(null, RUBRIC);
    expect(
      Array.from({ length: MAX_FOCUS }, (_, position) => unfocused.get(focusAlias(position))),
    ).toEqual(Array.from({ length: MAX_FOCUS }, () => []));
    expect(inAskerTerms('see c1/c2; k3 already holds it', unfocused)).toBe('see; already holds it');
    // A sentence that names no label is returned as written — `p99` is a percentile, not a probe.
    expect(inAskerTerms('holds p99 under 50 ms at the edge', terms)).toBe(
      'holds p99 under 50 ms at the edge',
    );
  });

  it('[QL-55] carries where the lesson was learned, and no label the producer or the author never saw', () => {
    const hit = hitOf('Make the enqueue async.', 'run-a', 'memory.2');
    const usable: UsableMemory = {
      alias: 'm10',
      hit: {
        ...hit,
        source: {
          ...hit.source,
          pipeline: 'system-design-canvas',
          iteration: 2,
          decision: 'revise',
          when: '2026-10-02',
        },
      },
      kept: {
        chunk: 'm10',
        serves: 'd4/c4 (contradiction of a sync write on the redirect path), d8/c8 (freshness)',
        insight: 'Make the click enqueue async so the redirect never waits on it.',
        caveat: 'the exact failure-mode gap matches d2',
      },
      support: 1,
      rubric: RUBRIC,
    };
    const lesson = lessonOf(usable, FOCUS);
    expect(lesson).toEqual({
      ref: 'm10',
      serves: 'contradiction (contradiction of a sync write on the redirect path), c3 (freshness)',
      insight: 'Make the click enqueue async so the redirect never waits on it.',
      caveat: 'the exact failure-mode gap matches unhandled failure',
      text: 'Make the enqueue async.',
      sourceRunId: 'run-a',
      pipeline: 'system-design-canvas',
      iteration: 2,
      decision: 'revise',
      when: '2026-10-02',
    });
    const [briefed] = briefingOf([lesson]);
    expect(briefed.text).not.toMatch(/\b[dk]\d+\b/);
    expect(briefed.text).toContain('serves: contradiction');

    // What the run records is the same lesson, focus beside it.
    const recorded = provenanceOf(
      {
        status: 'complete',
        reason: null,
        runId: 'recall-run',
        counts: { probes: 1, candidates: 1, kept: 1, usable: 1 },
        usable: [usable],
      },
      FOCUS,
    );
    expect(recorded.lessons).toEqual([lesson]);
    expect(recorded.focus).toEqual(FOCUS);
  });

  it('[QL-55] a lesson whose words named only labels that stand for nothing serves nothing the producer is told', () => {
    const lesson = lessonOf(
      {
        alias: 'm1',
        hit: hitOf('Own the store.', 'run-a', 'memory.1'),
        kept: { chunk: 'm1', serves: 'c9 / p2', insight: 'Own the store.', caveat: null },
        support: 0,
        rubric: RUBRIC,
      },
      FOCUS,
    );
    expect(lesson.serves).toBe('');
    expect(briefingOf([lesson])[0].text).toBe('Own the store.');
  });
});
