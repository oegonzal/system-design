import type { IterationTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { fromRun, teachesNothingNew } from './from-run';
import {
  MAX_FINDINGS,
  MAX_FINDING_CRITERIA,
  MAX_FINDING_REFS,
  readIndex,
  renderGoal,
  type ExperienceRecord,
} from './input';
import { PERSISTED_KEY, RESOLVED_KEY, sampleIterations, sampleRun } from './testing';

const traceOf = (run: ReturnType<typeof sampleRun>) => {
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return run.trace;
};

describe('composing an experience record from a finished run', () => {
  it('[QL-15] records what the engine established: remediation, reconciliation, transitions, deltas', () => {
    const record = fromRun(sampleRun());
    expect(record).not.toBeNull();
    if (record === null) return;

    expect(record.pipeline).toBe('system-design@1.0.0');
    expect(record.bestIteration).toBe(2);
    expect(record.artifact).toContain('[flow.1]');
    expect(record.prompt).toBe('# Prompt — Serve an order history\n\nList past orders.');

    expect(record.criteria.map((c) => [c.alias, c.id])).toEqual([
      ['r1', 'c1'],
      ['r2', 'c2'],
    ]);
    expect(record.criteria[0].results).toEqual([
      { iteration: 1, result: 'partial' },
      { iteration: 2, result: 'pass' },
    ]);
    expect(record.criteria[0].transitions).toEqual([
      { kind: 'improved', iterations: [1, 2], detail: 'partial → pass' },
    ]);
    expect(record.criteria[1].transitions).toEqual([]);

    const [resolved, persisted] = record.findings;
    expect(resolved).toMatchObject({
      alias: 'f1',
      key: RESOLVED_KEY,
      criteria: ['r1'],
      iterations: [1],
      remediated: true,
      rationale: 'the read path has no story for a POS outage',
      transitions: [{ kind: 'resolved', iterations: [1, 2], detail: 'the finding did not recur' }],
    });
    expect(persisted).toMatchObject({
      alias: 'f2',
      key: PERSISTED_KEY,
      iterations: [1, 2],
      remediated: false,
      lenses: ['critic.soundness', 'critic.requirements'],
      rationale: 'the API is stateless in one place and caches in another',
      transitions: [
        { kind: 'persisted', iterations: [1, 2], detail: 'the finding survived the revision' },
      ],
    });

    expect(record.iterations.map((it) => [it.decision, it.overall, it.overallDelta])).toEqual([
      ['revise', 57, null],
      ['accept', 86, 29],
    ]);
    expect(record.iterations[1].dimensionDeltas).toEqual({
      completeness: 50,
      soundness: 36,
      compliance: 0,
      quality_attributes: null,
    });
    expect(record.omitted).toEqual({ findings: 0, criteria: 0, adopted: 0 });
    expect(record.findings.every((finding) => !finding.adopted)).toBe(true);
  });

  it('[QL-15] a single-iteration run has no transition and no delta; a run without a settled trace is nothing yet', () => {
    const run = sampleRun();
    const [first] = sampleIterations();
    const single = fromRun({
      ...run,
      trace: { ...traceOf(run), iterations: [first], bestIteration: 1, lessons: [] },
    });
    expect(single?.iterations).toHaveLength(1);
    expect(single?.iterations[0].overallDelta).toBeNull();
    expect(single?.criteria.every((c) => c.transitions.length === 0)).toBe(true);
    expect(single?.findings.every((f) => f.transitions.length === 0)).toBe(true);

    expect(fromRun(sampleRun({ status: 'running', trace: null }))).toBeNull();
    // A run still going publishes its iterations so far, with no stop: nothing to learn yet.
    expect(
      fromRun({ ...run, status: 'running', trace: { ...traceOf(run), stopReason: null } }),
    ).toBeNull();
  });

  it('[QL-15] findings beyond the cap are counted, not silently dropped', () => {
    const run = sampleRun();
    const [first, second] = sampleIterations();
    const many: IterationTrace = {
      ...first,
      ledger: {
        ...first.ledger,
        findings: Array.from({ length: MAX_FINDINGS + 5 }, (_, index) => ({
          ...first.ledger.findings[0],
          key: `unhandled_failure|flow.${index + 1}`,
          locationRefs: [`flow.${index + 1}`],
        })),
      },
    };
    const record = fromRun({ ...run, trace: { ...traceOf(run), iterations: [many, second] } });
    expect(record?.findings).toHaveLength(MAX_FINDINGS);
    expect(record?.omitted.findings).toBe(6);
  });

  // A canvas finding spans a dozen places at once — bindings, edges, narrations
  // and the nodes they concern. The record declares both bounds and nothing
  // parses it at runtime, so they are held where it is assembled.
  it('[QL-15] a wide finding is held to the refs and criteria the record declares', () => {
    const run = sampleRun();
    const [first, second] = sampleIterations();
    const wide: IterationTrace = {
      ...first,
      ledger: {
        ...first.ledger,
        findings: [
          {
            ...first.ledger.findings[0],
            locationRefs: Array.from(
              { length: MAX_FINDING_REFS + 8 },
              (_, index) => `flow.${index + 1}`,
            ),
            criterionIds: Array.from({ length: MAX_FINDING_CRITERIA + 1 }, () => 'c1'),
          },
        ],
      },
    };
    const record = fromRun({ ...run, trace: { ...traceOf(run), iterations: [wide, second] } });
    expect(record?.findings[0].locationRefs).toHaveLength(MAX_FINDING_REFS);
    expect(record?.findings[0].criteria).toHaveLength(MAX_FINDING_CRITERIA);
    // The widest refs are kept in order, not sampled.
    expect(record?.findings[0].locationRefs[0]).toBe('flow.1');
  });
});

/** An iteration that produced nothing: no artifact, nothing judged, nothing confirmed. */
const lost = (iteration: IterationTrace, number: number): IterationTrace => ({
  ...iteration,
  iteration: number,
  artifact: null,
  rendered: null,
  critics: [],
  evaluators: [],
  ledger: { ...iteration.ledger, artifactPresent: false, criteria: [], findings: [] },
});

const adopting = (first: IterationTrace): IterationTrace => ({ ...first, mode: 'adopted' });

/** The record of the sample run over these iterations; it must compose. */
const recordOver = (
  iterations: IterationTrace[],
  rest: Partial<ReturnType<typeof traceOf>> = {},
): ExperienceRecord => {
  const run = sampleRun();
  const record = fromRun({ ...run, trace: { ...traceOf(run), iterations, ...rest } });
  if (record === null) throw new Error('the run must compose');
  return record;
};

describe('a run that adopted an earlier run’s iteration', () => {
  it('[QL-44] teaches nothing new when the adopted iteration is the only one with an artifact, as the measured siblings went', () => {
    const run = sampleRun();
    const [first, second] = sampleIterations();
    // Iteration 1 adopted from a grade, iteration 2 produced nothing: every judged row is the grade's.
    expect(
      teachesNothingNew({
        ...traceOf(run),
        iterations: [adopting(first), lost(second, 2)],
        bestIteration: 1,
        lessons: [],
      }),
    ).toBe(true);
    // A revision of its own was produced and judged: that is this run's evidence.
    expect(teachesNothingNew({ ...traceOf(run), iterations: [adopting(first), second] })).toBe(
      false,
    );
    // Nothing adopted is nothing copied, whatever else the run lacked.
    expect(teachesNothingNew(traceOf(run))).toBe(false);
    expect(
      teachesNothingNew({ ...traceOf(run), iterations: [lost(first, 1)], bestIteration: 1 }),
    ).toBe(false);
  });

  it('[QL-44] keeps an adopted finding only for what this run changed, marked so; one it never changed is counted out', () => {
    const [first, second] = sampleIterations();

    // The revision was judged, so the engine recorded what became of every adopted finding.
    const revised = recordOver([adopting(first), second]);
    expect(revised.omitted.adopted).toBe(0);
    expect(revised.findings.map((finding) => [finding.key, finding.adopted])).toEqual([
      [RESOLVED_KEY, true],
      // Seen again in the revision: this run's judges confirmed it too.
      [PERSISTED_KEY, false],
    ]);
    const goal = renderGoal(revised);
    expect(goal).toContain(
      '· seen i1 · adopted from an earlier run · remediated · resolved i1→i2 (the finding did not recur)',
    );
    expect(goal).not.toContain('seen only in an iteration adopted');

    // A lost revision between the copy and the next judged one: no transition spans it.
    const across = recordOver([adopting(first), lost(second, 2), { ...second, iteration: 3 }], {
      bestIteration: 3,
      lessons: [],
    });
    expect(across.findings.map((finding) => [finding.alias, finding.key, finding.adopted])).toEqual(
      [['f1', PERSISTED_KEY, false]],
    );
    expect(across.omitted).toEqual({ findings: 0, criteria: 0, adopted: 1 });
    const rendered = renderGoal(across);
    expect(readIndex(rendered)?.evidence.map((item) => item.alias)).toEqual(['f1', 'r1', 'r2']);
    expect(rendered).toContain(
      '(1 more findings omitted: seen only in an iteration adopted from an earlier run, with no change this run judged)',
    );
  });
});
