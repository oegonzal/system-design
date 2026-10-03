import type { QualityRunDto, RecallFocusDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { sampleIterations, sampleRun } from '../../../core/testing';
import { renderGoal as renderQuery } from '../../../pipelines/memory-recall/input';
import { samplePack } from '../../../pipelines/memory-recall/testing';
import { probeSet } from '../../../orchestrators/memory/recall/query';
import { builtQuery, fused, readoutTrace, recallHits } from '../../../orchestrators/memory/testing';
import { chunkRows, effectivenessOf, focusOutcomes, resolvedShare } from './effectiveness';

const RESOLVED_KEY = 'unhandled_failure|flow.1';
const PERSISTED_KEY = 'contradiction|component.1';

/** A recall run whose goal lists the candidates, so a lesson's own point is readable from it. */
const recallRun = (): QualityRunDto => {
  const hits = fused(recallHits());
  const goal = renderQuery(builtQuery('a query', probeSet('a query', []), hits));
  const run = sampleRun();
  return {
    ...run,
    runId: 'recall-run',
    pipeline: 'memory-recall',
    parentRunId: 'coach-run',
    // The query as the recall was asked it: the report reads the candidates'
    // own points out of this goal's index, which is structural rather than prose.
    request: { ...run.request, goal },
    trace: readoutTrace({
      pipeline: 'memory-recall',
      goal,
      artifact: samplePack(),
      locations: ['summary', 'm1'],
      criteria: [{ id: 'c1', kind: 'need', statement: 'informs the read path' }],
    }),
  };
};

/** The coach run: it adopted the judged iteration, was handed one lesson, and revised once. */
const coachRun = (overrides: Partial<RecallFocusDto> = {}): QualityRunDto => {
  const run = sampleRun();
  const [first, second] = sampleIterations();
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return {
    ...run,
    runId: 'coach-run',
    trace: { ...run.trace, iterations: [{ ...first, mode: 'adopted' }, second] },
    recall: {
      status: 'recalled',
      reason: null,
      note: null,
      recallRunId: 'recall-run',
      count: 1,
      novelty: null,
      lessons: [
        {
          ref: 'm1',
          serves: 'the list read',
          insight: 'serve the list from a store the page owns',
          caveat: null,
          text: 'serve the list from a store the page owns',
          sourceRunId: 'run-a',
        },
      ],
      focus: {
        runId: 'coach-run',
        iteration: 1,
        findings: [
          { type: 'unhandled_failure', severity: 'high', rationale: 'no story for an outage' },
          { type: 'contradiction', severity: 'medium', rationale: 'stateless and cached at once' },
        ],
        criteria: [
          { criterionId: 'c1', statement: 'List orders newest first.', result: 'partial' },
        ],
        ...overrides,
      },
    },
  };
};

describe('whether a recalled lesson went with a run whose defects resolved', () => {
  it('[QL-45] reads each searched-for defect’s outcome from the engine’s own transitions', () => {
    const run = coachRun();
    const focus = run.recall?.focus;
    if (!focus) throw new Error('the sample recall carries a focus');
    expect(focusOutcomes(run, focus)).toEqual([
      // The findings are matched by the order the focus named them in, which is
      // the order `focusOf` ranks the ledger — worst first.
      { subject: RESOLVED_KEY, kind: 'finding', from: null, outcome: 'resolved' },
      { subject: PERSISTED_KEY, kind: 'finding', from: null, outcome: 'persisted' },
      { subject: 'c1', kind: 'criterion', from: 'partial', outcome: 'improved' },
    ]);
    // Two of the three went well.
    expect(resolvedShare(focusOutcomes(run, focus))).toBeCloseTo(2 / 3);
  });

  it('[QL-45] nothing judging a defect again is no verdict on it', () => {
    const run = coachRun();
    const [first] = sampleIterations();
    if (run.trace === null) throw new Error('the sample run carries a trace');
    const alone = {
      ...run,
      trace: { ...run.trace, iterations: [{ ...first, mode: 'adopted' as const }], lessons: [] },
    };
    const focus = alone.recall?.focus;
    if (!focus) throw new Error('the sample recall carries a focus');
    const outcomes = focusOutcomes(alone, focus);
    expect(outcomes.every((outcome) => outcome.outcome === 'no-next-iteration')).toBe(true);
    expect(resolvedShare(outcomes)).toBeNull();
  });

  it('[QL-45] a lesson is reported with the point it came from, read from the recall’s own index', () => {
    const row = effectivenessOf({ run: coachRun(), recall: recallRun() });
    expect(row).toMatchObject({
      runId: 'coach-run',
      recallRunId: 'recall-run',
      baseIteration: 1,
    });
    expect(row.focusResolvedShare).toBeCloseTo(2 / 3);
    const briefed = row.lessons.find((lesson) => lesson.ref === 'm1');
    expect(briefed).toMatchObject({
      sourceRunId: 'run-a',
      sourceRef: 'memory.1',
      offered: true,
      kept: true,
      briefed: true,
    });
    // A candidate the curator kept but the producer was not handed is offered
    // and kept, never briefed; one it dropped is offered alone.
    expect(row.lessons.find((lesson) => lesson.ref === 'm2')).toMatchObject({
      offered: true,
      kept: true,
      briefed: false,
    });
    expect(row.lessons.find((lesson) => lesson.ref === 'm3')).toMatchObject({
      offered: true,
      kept: false,
      briefed: false,
    });
  });

  it('[QL-45] a chunk’s row sums the runs it reached and how those runs went', () => {
    const run = effectivenessOf({ run: coachRun(), recall: recallRun() });
    const rows = chunkRows([run, run]);
    const briefed = rows.find((row) => row.ref === 'memory.1');
    expect(briefed).toMatchObject({
      sourceRunId: 'run-a',
      offered: 2,
      kept: 2,
      briefed: 2,
      runsWithAnyFocusResolved: 2,
    });
    expect(briefed?.meanFocusResolvedShare).toBeCloseTo(2 / 3);
    // A chunk offered but never briefed carries no outcome at all.
    const unbriefed = rows.find((row) => row.ref === 'memory.2');
    expect(unbriefed).toMatchObject({ offered: 2, briefed: 0, meanFocusResolvedShare: null });
  });
});
