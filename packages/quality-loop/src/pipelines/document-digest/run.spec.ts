import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { admission, outputsOf } from '../../core/outputs';
import { fakeLlm } from '../../core/testing';
import { DOCUMENT_DIGEST } from './definition';
import { documentCriteria, documentGoal, sampleDocumentDigest } from './testing';

/** One result per criterion, each in its own evaluator's answer: the capture evaluator's schema locks to c1, the rules evaluator's to c2. */
const result = (criterionId: string, verdict: 'pass' | 'fail', rationale: string) => ({
  results: [
    { criterionId, result: verdict, confidence: 'high', locationRefs: ['memory.1'], rationale },
  ],
  advisoryVerdict: null,
});

const canned = [
  { criteria: documentCriteria().map(({ kind, statement }) => ({ kind, statement })) },
  sampleDocumentDigest(),
  {
    findings: [
      {
        type: 'invented_fact',
        severity: 'high',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs: ['memory.1'],
        criterionIds: ['c2'],
        rationale:
          'section.2 says the subject led the move to event-driven order processing; nothing there says they led a team',
      },
    ],
  },
  result('c1', 'pass', 'memory.1 holds the role, employer, dates and stack of section.2'),
  result('c2', 'fail', 'memory.1 states more than section.2 does'),
];

describe('the document-digest loop', () => {
  it('[QL-40] an invented fact gates the digest: both samples agree, the memory is faulted where it sits, and the run is revised, never admitted', async () => {
    const trace = await runPipeline(
      DOCUMENT_DIGEST,
      { goal: documentGoal(), maxIterations: 2 },
      { llm: fakeLlm(...canned), sink: () => undefined, now: () => 0 },
    );

    expect(trace.contract.criteria.map((criterion) => `${criterion.id}:${criterion.kind}`)).toEqual(
      ['c1:fact', 'c2:rule'],
    );
    expect(trace.iterations).toHaveLength(2);
    for (const iteration of trace.iterations) {
      expect(iteration.validation.every((report) => report.problems.length === 0)).toBe(true);
      // Places only: the unused section is read, never pointed at.
      expect(iteration.locations.map((location) => location.id)).toEqual([
        'summary',
        'memory.1',
        'memory.2',
      ]);
      expect(iteration.ledger.findings.map((finding) => finding.key)).toEqual([
        'invented_fact|memory.1',
      ]);
      // Two samples of every critic reported it; two hits is what confirms a gated finding.
      expect(iteration.ledger.findings[0].hits).toBeGreaterThanOrEqual(2);
      expect(iteration.ledger.criteria.map((entry) => [entry.criterionId, entry.result])).toEqual([
        ['c1', 'pass'],
        ['c2', 'fail'],
      ]);
      expect(iteration.decision.gates.policyAllowed).toBe(false);
      expect(iteration.decision.finalDecision).toBe('revise');
    }
    expect(trace.stopReason).toBe('max-iterations');
    expect(trace.lessons).toContainEqual({
      kind: 'persisted',
      subject: 'invented_fact|memory.1',
      iterations: [1, 2],
      detail: 'the finding survived the revision',
    });
    // What the document-memory orchestrator would read: judged, and short of the bar.
    expect(admission(outputsOf(trace), DOCUMENT_DIGEST.policy.thresholds.acceptAt)).toBe(
      'fell-short',
    );
  });
});
