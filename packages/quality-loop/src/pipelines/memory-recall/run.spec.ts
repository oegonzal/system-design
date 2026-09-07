import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/run-pipeline';
import { fakeLlm } from '../../core/testing';
import { MEMORY_RECALL } from './definition';
import { renderGoal } from './input';
import { samplePack, sampleQuery } from './testing';

const canned = [
  {
    criteria: [
      { kind: 'need', statement: 'the list read stays up when the POS is down' },
      { kind: 'admissibility', statement: 'an insight is only what its chunk says' },
    ],
  },
  samplePack(),
  {
    findings: [
      {
        type: 'irrelevant_chunk',
        severity: 'medium',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs: ['m2'],
        criterionIds: [],
        rationale: 'the data-model chunk informs no need of the query',
      },
    ],
  },
  {
    results: [
      {
        criterionId: 'c1',
        result: 'fail',
        confidence: 'high',
        locationRefs: ['m1'],
        rationale: 'an outage story, not a mechanism',
      },
    ],
    advisoryVerdict: null,
  },
  {
    results: [
      {
        criterionId: 'c2',
        result: 'pass',
        confidence: 'high',
        locationRefs: ['m1', 'm2'],
        rationale: 'each insight is in its chunk',
      },
    ],
    advisoryVerdict: null,
  },
];

describe('the memory-recall loop', () => {
  it("[QL-9] chunk aliases keep a finding's key across revisions and every alias stays citable", async () => {
    const trace = await runPipeline(
      MEMORY_RECALL,
      { goal: renderGoal(sampleQuery()), maxIterations: 2 },
      { llm: fakeLlm(...canned), sink: () => undefined, now: () => 0 },
    );

    expect(trace.iterations).toHaveLength(2);
    for (const iteration of trace.iterations) {
      expect(iteration.validation.every((report) => report.problems.length === 0)).toBe(true);
      expect(iteration.locations.map((location) => location.id)).toEqual([
        'summary',
        'm1',
        'm2',
        'm3',
        'gap.1',
      ]);
      expect(iteration.ledger.findings.map((finding) => finding.key)).toEqual([
        'irrelevant_chunk|m2',
      ]);
      expect(iteration.decision.finalDecision).toBe('revise');
    }
    expect(trace.iterations[0].mode).toBe('initial');
    expect(trace.iterations[1].mode).toBe('revise');
    expect(trace.lessons).toContainEqual({
      kind: 'persisted',
      subject: 'irrelevant_chunk|m2',
      iterations: [1, 2],
      detail: 'the finding survived the revision',
    });
    expect(trace.stopReason).toBe('max-iterations');
  });
});
