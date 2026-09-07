import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/run-pipeline';
import { fakeLlm } from '../../core/testing';
import { fromRun } from './compose';
import { EXPERIENCE_DIGEST } from './definition';
import { renderGoal } from './input';
import { sampleDigest, sampleRun } from './testing';

const canned = [
  {
    criteria: [
      { kind: 'signal', statement: 'f1 was remediated in i1 and did not recur' },
      { kind: 'transition', statement: 'r1 improved from partial to pass between i1 and i2' },
    ],
  },
  sampleDigest(),
  {
    findings: [
      {
        type: 'run_specific',
        severity: 'medium',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs: ['memory.1'],
        criterionIds: [],
        rationale: 'the insight names the POS instead of any unreliable upstream',
      },
    ],
  },
  {
    results: [
      {
        criterionId: 'c1',
        result: 'fail',
        confidence: 'high',
        locationRefs: ['memory.1'],
        rationale: 'the memory blurs what was fixed',
      },
      {
        criterionId: 'c2',
        result: 'pass',
        confidence: 'high',
        locationRefs: ['memory.1'],
        rationale: 'it rests on r1 and says it improved',
      },
    ],
    advisoryVerdict: null,
  },
];

describe('the experience-digest loop', () => {
  it("[QL-9] evidence aliases keep a finding's key across revisions and every alias stays citable", async () => {
    const record = fromRun(sampleRun());
    if (record === null) throw new Error('the sample run must compose');
    const trace = await runPipeline(
      EXPERIENCE_DIGEST,
      { goal: renderGoal(record), maxIterations: 2 },
      { llm: fakeLlm(...canned), sink: () => undefined, now: () => 0 },
    );

    expect(trace.iterations).toHaveLength(2);
    for (const iteration of trace.iterations) {
      expect(iteration.validation.every((report) => report.problems.length === 0)).toBe(true);
      expect(iteration.locations.map((location) => location.id)).toEqual([
        'summary',
        'memory.1',
        'f1',
        'r1',
        'f2',
        'r2',
      ]);
      expect(iteration.ledger.findings.map((finding) => finding.key)).toEqual([
        'run_specific|memory.1',
      ]);
      expect(iteration.decision.finalDecision).toBe('revise');
    }
    expect(trace.lessons).toContainEqual({
      kind: 'persisted',
      subject: 'run_specific|memory.1',
      iterations: [1, 2],
      detail: 'the finding survived the revision',
    });
    expect(trace.stopReason).toBe('max-iterations');
  });
});
