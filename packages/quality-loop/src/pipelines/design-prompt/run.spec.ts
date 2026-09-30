import { renderDesignPromptMarkdown, DESIGN_PROMPT_HEADINGS } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { sequencedLlm } from '../../core/testing';
import { DESIGN_PROMPT } from './definition';
import { EMPLOYER, leakedDraft, sampleDraft, sampleExperienceGoal } from './testing';

const criteria = {
  criteria: [
    {
      kind: 'fidelity',
      statement: 'The prompt merges webhook-pushed online orders with polled in-store orders.',
    },
    { kind: 'gradeability', statement: 'Every quality target carries a figure with a unit.' },
    { kind: 'scope', statement: 'No employer, product or vendor is named.' },
  ],
};

const leak = {
  findings: [
    {
      type: 'brand_leak',
      severity: 'high',
      confidence: 'high',
      fixability: 'fixable_local',
      locationRefs: ['constraint.2'],
      criterionIds: ['c3'],
      rationale: `the second constraint names ${EMPLOYER}`,
    },
  ],
};
const clean = { findings: [] };

const result = (criterionId: string, verdict: 'pass' | 'fail') => ({
  criterionId,
  result: verdict,
  confidence: 'high',
  locationRefs: ['scenario'],
  rationale: verdict === 'pass' ? 'it is there' : 'a name is in it',
});
const firstResults = {
  results: [result('c1', 'pass'), result('c2', 'pass'), result('c3', 'fail')],
  advisoryVerdict: 'revise',
};
const secondResults = {
  results: [result('c1', 'pass'), result('c2', 'pass'), result('c3', 'pass')],
  advisoryVerdict: 'accept',
};

describe('the design-prompt loop', () => {
  it('[QL-21] a leaked employer gates the first draft; the rewrite without it is accepted and renders to the house markdown', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      DESIGN_PROMPT,
      { goal: sampleExperienceGoal() },
      {
        llm: sequencedLlm(
          criteria,
          leak,
          clean,
          leakedDraft(),
          sampleDraft(),
          firstResults,
          secondResults,
        ),
        sink: (exchange) => exchanges.push(exchange),
        now: () => 0,
      },
    );

    expect(trace.contract.criteria.map((criterion) => `${criterion.id}:${criterion.kind}`)).toEqual(
      ['c1:fidelity', 'c2:gradeability', 'c3:scope'],
    );
    expect(exchanges.filter((exchange) => exchange.scope === 'criteria')).toHaveLength(1);

    expect(trace.iterations.map((iteration) => iteration.mode)).toEqual(['initial', 'revise']);
    const [first, second] = trace.iterations;
    expect(first.ledger.findings).toMatchObject([
      {
        key: 'brand_leak|constraint.2',
        lenses: ['critic.fidelity'],
        hits: 1,
        criterionIds: ['c3'],
      },
    ]);
    expect(first.decision.finalDecision).toBe('revise');
    expect(first.decision.gates.policyAllowed).toBe(false);
    expect(first.decision.reason).toContain('brand_leak|constraint.2');

    expect(second.ledger.findings).toEqual([]);
    expect(second.decision.finalDecision).toBe('accept');
    expect(trace.stopReason).toBe('accepted');
    expect(trace.bestIteration).toBe(2);

    const best = trace.iterations[trace.bestIteration - 1].artifact;
    if (best === null) throw new Error('the accepted iteration carries its draft');
    const markdown = renderDesignPromptMarkdown(best);
    expect(markdown.startsWith('# ')).toBe(true);
    expect(markdown).toContain(DESIGN_PROMPT_HEADINGS.nonFunctional);
    expect(markdown).not.toContain(EMPLOYER);
  });
});
