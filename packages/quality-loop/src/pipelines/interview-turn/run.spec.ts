import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { sequencedLlm } from '../../core/testing';
import { INTERVIEW_TURN } from './definition';
import { leakedTurn, sampleInterviewGoal } from './testing';

const criteria = { criteria: [] };

const leak = {
  findings: [
    {
      type: 'answer_leaked',
      severity: 'high',
      confidence: 'high',
      fixability: 'fixable_local',
      locationRefs: ['reply.2'],
      criterionIds: ['c2'],
      rationale: 'the second reply hands the candidate a read model and a queue',
    },
  ],
};

const result = (criterionId: string, verdict: 'pass' | 'fail') => ({
  criterionId,
  result: verdict,
  confidence: 'high',
  locationRefs: ['reply.2'],
  rationale: verdict === 'pass' ? 'held' : 'a design was given away',
});
const results = {
  results: [result('c1', 'pass'), result('c2', 'fail'), result('c3', 'pass')],
  advisoryVerdict: 'revise',
};

describe('the interview-turn loop', () => {
  it('[DEL-10] one iteration under the three fixed rules: a reply that gives the answer away is confirmed by both samples, priced, and still the turn’s artifact', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      INTERVIEW_TURN,
      { goal: sampleInterviewGoal() },
      {
        llm: sequencedLlm(criteria, leakedTurn(), leak, leak, results, results),
        sink: (exchange) => exchanges.push(exchange),
        now: () => 0,
      },
    );

    expect(trace.contract.criteria.map((criterion) => `${criterion.id}:${criterion.kind}`)).toEqual(
      ['c1:fidelity', 'c2:restraint', 'c3:clarity'],
    );
    expect(trace.iterations).toHaveLength(1);
    const [only] = trace.iterations;
    expect(only.artifact).toEqual(leakedTurn());
    expect(only.ledger.findings).toMatchObject([
      { key: 'answer_leaked|reply.2', lenses: ['critic.conduct'], hits: 2, criterionIds: ['c2'] },
    ]);
    // Nothing gates: the decision is the score's alone, and the studio claims the reply whatever it says.
    expect(only.decision.gates.policyAllowed).toBe(true);
    expect(only.decision.finalDecision).not.toBe('accept');
    expect(only.decision.scores.dimensions['restraint']).toBeLessThan(
      only.decision.scores.dimensions['fidelity'] ?? 0,
    );
    expect(
      exchanges.filter((exchange) => exchange.scope.startsWith('critic.conduct')),
    ).toHaveLength(2);
    expect(
      exchanges.filter((exchange) => exchange.scope.startsWith('evaluator.turn')),
    ).toHaveLength(2);
  });
});
