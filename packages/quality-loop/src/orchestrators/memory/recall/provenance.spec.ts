import type { RecallFocusDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { briefingOf } from '../../../modules/runs/recall/run-recall';
import { hitOf } from '../testing';
import { lessonOf, provenanceOf } from './provenance';
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

describe('a recalled lesson in the asker’s terms', () => {
  it('[QL-55] reads each defect a kept chunk cites back as the criterion or defect it stands for, and hands the words on as written', () => {
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
        serves: 'a sync write on the redirect path, and click freshness',
        // A defect cited twice is one answer; d8 is a criterion the grade fell short on.
        cites: ['d4', 'd8', 'd4'],
        insight: 'Make the click enqueue async so the redirect never waits on it.',
        caveat: 'the failure mode it names is a different queue',
      },
      support: 1,
    };
    const lesson = lessonOf(usable, FOCUS);
    expect(lesson).toEqual({
      ref: 'm10',
      serves: 'a sync write on the redirect path, and click freshness',
      answers: ['contradiction', 'c3'],
      insight: 'Make the click enqueue async so the redirect never waits on it.',
      caveat: 'the failure mode it names is a different queue',
      text: 'Make the enqueue async.',
      sourceRunId: 'run-a',
      pipeline: 'system-design-canvas',
      iteration: 2,
      decision: 'revise',
      when: '2026-10-02',
    });
    const [briefed] = briefingOf([lesson]);
    expect(briefed.text).toContain('answers: contradiction, c3');
    expect(briefed.text).not.toMatch(/\bd\d+\b/);

    // Every focus label stands for its own line; a label past the focus, or a recall with none, for nothing.
    const cited = (cites: string[], focus: RecallFocusDto | null) =>
      lessonOf({ ...usable, kept: { ...usable.kept, cites } }, focus).answers;
    expect(cited(['d6'], FOCUS)).toEqual(['c5']);
    expect(cited(['d2'], FOCUS)).toEqual(['unhandled failure']);
    expect(cited(['d9'], FOCUS)).toEqual([]);
    expect(cited(['d1'], null)).toEqual([]);

    // What the run records is the same lesson, focus beside it.
    const recorded = provenanceOf(
      {
        status: 'complete',
        reason: null,
        runId: 'recall-run',
        counts: { probes: 1, candidates: 1, deferred: 0, kept: 1, usable: 1 },
        usable: [usable],
      },
      FOCUS,
    );
    expect(recorded.lessons).toEqual([lesson]);
    expect(recorded.focus).toEqual(FOCUS);
  });

  it("[QL-52] records how many hits the goal budget left out of the curator's query, and none where no query was curated", () => {
    const usable: UsableMemory = {
      alias: 'm1',
      hit: hitOf('Own the store.', 'run-a', 'memory.1'),
      kept: {
        chunk: 'm1',
        serves: 'the read path',
        cites: [],
        insight: 'Own the store.',
        caveat: null,
      },
      support: 1,
    };
    const counts = { probes: 1, candidates: 13, deferred: 3, kept: 1, usable: 1 };
    const recalled = provenanceOf({
      status: 'complete',
      reason: null,
      runId: 'recall-run',
      counts,
      usable: [usable],
    });
    expect(recalled).toMatchObject({ status: 'recalled', count: 1, deferred: 3 });
    // Curated and endorsed nothing: what was left out still counts.
    expect(
      provenanceOf({
        status: 'complete',
        reason: 'no-usable-memory',
        runId: 'recall-run',
        counts: { ...counts, usable: 0 },
        usable: [],
      }),
    ).toMatchObject({ status: 'empty', deferred: 3 });
    // Never curated: nothing was offered, so nothing was left out.
    expect(provenanceOf({ status: 'skipped', reason: 'store-empty', note: null }).deferred).toBe(0);
    expect(
      provenanceOf({
        status: 'failed',
        reason: 'query-refused',
        note: 'candidates[0].source.decision: Invalid option',
        runId: null,
      }).deferred,
    ).toBe(0);
  });
});
