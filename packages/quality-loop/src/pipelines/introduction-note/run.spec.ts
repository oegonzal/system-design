import { introductionNoteRubric } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { sequencedLlm } from '../../core/testing';
import { INTRODUCTION_NOTE } from './definition';
import { overreachingNote, sampleIntroductionGoal, sampleNote } from './testing';

const overreach = {
  findings: [
    {
      type: 'unbacked_claim',
      severity: 'high',
      confidence: 'high',
      fixability: 'fixable_local',
      locationRefs: ['opening'],
      criterionIds: ['c1'],
      rationale: 'the opening claims past work for the Navy and a price the goal never stated',
    },
  ],
};
const clean = { findings: [] };

const result = (criterionId: string, verdict: 'pass' | 'fail') => ({
  criterionId,
  result: verdict,
  confidence: 'high',
  locationRefs: ['opening'],
  rationale: verdict === 'pass' ? 'held' : 'a claim the goal never made',
});
const judged = (fidelity: 'pass' | 'fail') => ({
  results: [
    result('c1', fidelity),
    result('c2', 'pass'),
    result('c3', 'pass'),
    result('c4', 'pass'),
  ],
  advisoryVerdict: fidelity === 'pass' ? 'accept' : 'revise',
});

describe('the introduction-note loop', () => {
  it('[QL-82] under the four supplied rules a note with a claim the goal never made is confirmed by both samples, priced on its substance and revised once; the revision is accepted and is the run’s best', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      INTRODUCTION_NOTE,
      { goal: sampleIntroductionGoal(), criteria: introductionNoteRubric() },
      {
        llm: sequencedLlm(
          overreachingNote(),
          overreach,
          overreach,
          judged('fail'),
          judged('fail'),
          sampleNote(),
          clean,
          clean,
          judged('pass'),
          judged('pass'),
        ),
        sink: (exchange) => exchanges.push(exchange),
        now: () => 0,
      },
    );

    expect(trace.contract.criteria.map((criterion) => `${criterion.id}:${criterion.kind}`)).toEqual(
      ['c1:fidelity', 'c2:relevance', 'c3:restraint', 'c4:clarity'],
    );
    expect(trace.iterations).toHaveLength(2);
    const [first, second] = trace.iterations;
    expect(first.artifact).toEqual(overreachingNote());
    expect(first.ledger.findings).toMatchObject([
      { key: 'unbacked_claim|opening', lenses: ['critic.claims'], hits: 2, criterionIds: ['c1'] },
    ]);
    expect(first.decision.gates.policyAllowed).toBe(true);
    expect(first.decision.finalDecision).toBe('revise');
    expect(first.decision.scores.dimensions['substance']).toBeLessThan(
      first.decision.scores.dimensions['conduct'] ?? 0,
    );
    expect(second.artifact).toEqual(sampleNote());
    expect(second.decision.finalDecision).toBe('accept');
    expect(trace.bestIteration).toBe(2);
    expect(trace.finalDecision).toBe('accept');
    expect(exchanges.filter((exchange) => exchange.scope.startsWith('critic.claims'))).toHaveLength(
      4,
    );
    expect(
      exchanges.filter((exchange) => exchange.scope.startsWith('evaluator.note')),
    ).toHaveLength(4);
  });
});
