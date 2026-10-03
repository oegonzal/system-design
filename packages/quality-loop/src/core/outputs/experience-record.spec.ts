import type { IterationTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { PERSISTED_KEY, RESOLVED_KEY, sampleIterations, sampleRun } from '../testing/experience';
import {
  MAX_FINDINGS,
  MAX_FINDING_CRITERIA,
  MAX_FINDING_REFS,
  experienceOf,
} from './experience-record';

const traceOf = (run: ReturnType<typeof sampleRun>) => {
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return run.trace;
};

describe('reducing a finished run to the facts a digest reasons over', () => {
  it('[QL-15] records what the engine established: remediation, reconciliation, transitions, deltas', () => {
    const record = experienceOf(sampleRun());
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
    const single = experienceOf({
      ...run,
      trace: { ...traceOf(run), iterations: [first], bestIteration: 1, lessons: [] },
    });
    expect(single?.iterations).toHaveLength(1);
    expect(single?.iterations[0].overallDelta).toBeNull();
    expect(single?.criteria.every((c) => c.transitions.length === 0)).toBe(true);
    expect(single?.findings.every((f) => f.transitions.length === 0)).toBe(true);

    expect(experienceOf(sampleRun({ status: 'running', trace: null }))).toBeNull();
    // A run still going publishes its iterations so far, with no stop: nothing to learn yet.
    expect(
      experienceOf({ ...run, status: 'running', trace: { ...traceOf(run), stopReason: null } }),
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
    const record = experienceOf({ ...run, trace: { ...traceOf(run), iterations: [many, second] } });
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
    const record = experienceOf({ ...run, trace: { ...traceOf(run), iterations: [wide, second] } });
    expect(record?.findings[0].locationRefs).toHaveLength(MAX_FINDING_REFS);
    expect(record?.findings[0].criteria).toHaveLength(MAX_FINDING_CRITERIA);
    // The widest refs are kept in order, not sampled.
    expect(record?.findings[0].locationRefs[0]).toBe('flow.1');
  });
});
