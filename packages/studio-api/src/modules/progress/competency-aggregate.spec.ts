import { CANVAS_CRITERION_KINDS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { aggregateCompetencies, weakestKind, type GradedRevision } from './competency-aggregate';

const graded = (
  sessionId: string,
  gradedAt: string,
  criteria: readonly [kind: string, result: string][],
): GradedRevision => ({
  sessionId,
  gradedAt,
  criteria: criteria.map(([kind, result]) => ({ kind, result })),
});

describe('aggregateCompetencies', () => {
  it('[EVAL-5] counts settled verdicts per declared kind, in the contract’s order, and a kind never assessed has zeros and no date', () => {
    const competencies = aggregateCompetencies([
      graded('s1', '2026-10-01T10:00:00.000Z', [
        ['functional', 'pass'],
        ['functional', 'fail'],
        ['tradeoff', 'partial'],
        ['scale', 'unassessed'],
        ['scale', 'not_applicable'],
      ]),
    ]);
    expect(competencies.map((competency) => competency.kind)).toEqual([...CANVAS_CRITERION_KINDS]);
    expect(competencies.find((competency) => competency.kind === 'functional')).toEqual({
      kind: 'functional',
      assessed: 2,
      passed: 1,
      partial: 0,
      failed: 1,
      lastPractisedAt: '2026-10-01T10:00:00.000Z',
      recent: [0.5],
    });
    expect(competencies.find((competency) => competency.kind === 'tradeoff')).toMatchObject({
      assessed: 1,
      partial: 1,
      recent: [0],
    });
    // Unassessed and not-applicable verdicts are nobody's judgement.
    expect(competencies.find((competency) => competency.kind === 'scale')).toEqual({
      kind: 'scale',
      assessed: 0,
      passed: 0,
      partial: 0,
      failed: 0,
      lastPractisedAt: null,
      recent: [],
    });
  });

  it('[EVAL-5] the trend is one pass share per session, newest last, each session read at its newest graded revision, over the last five', () => {
    const revisions: GradedRevision[] = [];
    for (let day = 1; day <= 7; day++) {
      revisions.push(
        graded(`s${day}`, `2026-10-0${day}T10:00:00.000Z`, [
          ['workflow', day % 2 === 0 ? 'pass' : 'fail'],
        ]),
      );
    }
    // The same session graded again later: only its newest revision speaks for it.
    revisions.push(graded('s7', '2026-10-07T12:00:00.000Z', [['workflow', 'pass']]));
    const [workflow] = aggregateCompetencies(revisions).filter(
      (competency) => competency.kind === 'workflow',
    );
    expect(workflow?.recent).toEqual([0, 1, 0, 1, 1]);
    expect(workflow?.assessed).toBe(8);
    expect(workflow?.lastPractisedAt).toBe('2026-10-07T12:00:00.000Z');
  });

  it('[EVAL-5] a kind a run assessed that the contract no longer declares is still counted, after the declared ones', () => {
    const competencies = aggregateCompetencies([
      graded('s1', '2026-10-01T10:00:00.000Z', [['retired_kind', 'pass']]),
    ]);
    expect(competencies.at(-1)).toMatchObject({ kind: 'retired_kind', assessed: 1, passed: 1 });
    expect(competencies).toHaveLength(CANVAS_CRITERION_KINDS.length + 1);
  });
});

describe('weakestKind', () => {
  const competency = (kind: string, passed: number, partial: number, failed: number) => ({
    kind,
    assessed: passed + partial + failed,
    passed,
    partial,
    failed,
    lastPractisedAt: null,
    recent: [],
  });

  it('[EVAL-5] is the lowest pass share among declared kinds assessed enough to say; ties go to the kind assessed less, then declared order', () => {
    expect(
      weakestKind([
        competency('functional', 1, 0, 2),
        competency('interface', 2, 0, 4),
        competency('boundary', 3, 0, 0),
        competency('retired_kind', 0, 0, 9),
      ]),
    ).toBe('functional');
    expect(
      weakestKind([competency('functional', 1, 0, 1), competency('scale', 0, 0, 1)]),
    ).toBeNull();
    expect(weakestKind([competency('boundary', 1, 1, 1), competency('functional', 1, 1, 1)])).toBe(
      'functional',
    );
  });
});
