import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { fakeLlm, sampleRun } from '../../core/testing';
import { KNOWLEDGE_DIGEST } from './definition';
import { fromRun } from './from-run';
import { renderGoal } from './input';
import { sampleDigest, sampleKnown, sampleSource } from './testing';

const canned = [
  {
    criteria: [
      { kind: 'signal', statement: 'f1 was remediated in i1 and did not recur' },
      { kind: 'held', statement: 'r2 passed in both iterations under a stated mechanism' },
      { kind: 'delta', statement: 'k1 is the same lesson f1 shows, so the digest must confirm it' },
    ],
  },
  sampleDigest(),
  {
    findings: [
      {
        type: 'vague_item',
        severity: 'medium',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs: ['memory.1'],
        criterionIds: [],
        rationale: 'the condition restates the insight rather than naming a situation',
      },
    ],
  },
  // One answer per evaluator: each is scoped to the criterion kinds it judges,
  // so its schema admits only those criteria's ids and the two never cross-match.
  {
    results: [
      {
        criterionId: 'c1',
        result: 'partial',
        confidence: 'high',
        locationRefs: ['memory.1'],
        rationale: 'the item rests on f1 but blurs which revision closed it',
      },
      {
        criterionId: 'c2',
        result: 'fail',
        confidence: 'high',
        locationRefs: ['r2'],
        rationale: 'nothing accounts for the constraint that held throughout',
      },
    ],
    advisoryVerdict: null,
  },
  {
    results: [
      {
        criterionId: 'c3',
        result: 'pass',
        confidence: 'high',
        locationRefs: ['memory.1'],
        rationale: 'the item confirms k1 by its alias',
      },
    ],
    advisoryVerdict: null,
  },
];

const compose = (overrides: Parameters<typeof sampleDigest>[0] = {}) => {
  const record = fromRun(sampleRun(), sampleSource(), { known: [sampleKnown()] });
  if (record === null) throw new Error('the sample run must compose');
  void overrides;
  return renderGoal(record);
};

describe('the knowledge-digest loop', () => {
  it('[QL-9] a finding is located at the item it faults, every unused alias stays citable, and a confirmed item is one the delta criterion can pass', async () => {
    const trace = await runPipeline(
      KNOWLEDGE_DIGEST,
      { goal: compose(), maxIterations: 2 },
      { llm: fakeLlm(...canned), sink: () => undefined, now: () => 0 },
    );

    expect(trace.iterations).toHaveLength(2);
    for (const iteration of trace.iterations) {
      // The three warn-gated content rules are satisfied by this item, so the
      // only problems a judge could see are none.
      expect(iteration.validation.every((report) => report.problems.length === 0)).toBe(true);
      expect(iteration.locations.map((location) => location.id)).toEqual([
        'summary',
        'memory.1',
        'f2',
        'r2',
      ]);
      expect(iteration.ledger.findings.map((finding) => finding.key)).toEqual([
        'vague_item|memory.1',
      ]);
      // Priced, not gated: an item a rewrite would improve is still an item.
      expect(iteration.decision.gates.policyAllowed).toBe(true);
    }
    expect(trace.lessons).toContainEqual({
      kind: 'persisted',
      subject: 'vague_item|memory.1',
      iterations: [1, 2],
      detail: 'the finding survived the revision',
    });
    expect(trace.stopReason).toBe('max-iterations');
  });

  it('[QL-9] a warn-gated content rule faults one item and leaves the digest judgeable', async () => {
    // The same digest, with the insight naming a place of this run's artifact.
    const borrowed = sampleDigest({
      memories: [
        {
          ...sampleDigest().memories[0],
          insight: 'Put a durable queue in front of flow.1 so the read path survives the upstream.',
        },
      ],
    });
    const trace = await runPipeline(
      KNOWLEDGE_DIGEST,
      { goal: compose(), maxIterations: 1 },
      {
        llm: fakeLlm(canned[0], borrowed, canned[2], canned[3], canned[4]),
        sink: () => undefined,
        now: () => 0,
      },
    );

    const [iteration] = trace.iterations;
    const warned = iteration.validation.filter((report) => report.problems.length > 0);
    expect(warned.map((report) => report.validatorId)).toEqual(['run-specificity']);
    expect(warned[0].gate).toBe('warn');
    expect(warned[0].problems[0].locationRefs).toEqual(['memory.1']);
    // The digest was still judged: a content rule costs the item, not the run.
    expect(iteration.decision.gates.validatorsPassed).toBe(true);
    expect(iteration.ledger.artifactPresent).toBe(true);
  });
});
