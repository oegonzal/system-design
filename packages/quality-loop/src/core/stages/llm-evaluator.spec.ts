import { describe, expect, it } from 'vitest';

import type { LlmCall } from '@sysdesign/llm';
import { emptyUpstream, type LensContext } from '../ports';
import { criterion, fakeLlm, result, tinyPipeline, type TinyOutput } from '../testing';
import { createLlmEvaluator } from './llm-evaluator';

const definition = tinyPipeline();
const artifact: TinyOutput = { text: 't', parts: [] };
const ctx: LensContext<TinyOutput> = {
  contract: { ...definition.task, goal: 'g', criteria: [criterion('c1'), criterion('c2', 'nice')] },
  artifact,
  locations: definition.task.output.locate(artifact),
  rendered: definition.task.output.render(artifact),
  validation: [],
  upstream: emptyUpstream(),
};

describe('createLlmEvaluator', () => {
  it('[QL-4] is shown the confirmed upstream defects only when it declared it consumes them', async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({
      results: [
        result({ criterionId: 'c1', locationRefs: [] }),
        result({ criterionId: 'c2', locationRefs: [] }),
      ],
      advisoryVerdict: null,
    }).withRecorder((call) => calls.push(call));
    const upstream = {
      findings: [
        {
          key: 'gap|text',
          type: 'gap',
          severity: 'medium' as const,
          confidence: 'high' as const,
          fixability: 'fixable_local' as const,
          locationRefs: ['text'],
          criterionIds: ['c1'],
          hits: 1,
          lenses: ['critic.tiny'],
          rationale: null,
          reconciledTo: null,
          rationale: 'the text is thin',
        },
      ],
      results: [],
    };
    await createLlmEvaluator<TinyOutput>({ ...definition.evaluators[0], consumes: ['findings'] }, [
      llm,
    ]).run({ ...ctx, upstream });
    expect(calls[0].user).toContain('# Confirmed upstream defects');
    expect(calls[0].user).toContain('[medium] gap at text → criteria c1');
    expect(calls[0].user).toContain('the text is thin');

    await createLlmEvaluator<TinyOutput>(definition.evaluators[0], [llm]).run({ ...ctx, upstream });
    expect(calls[1].user).not.toContain('upstream');
  });

  it('[QL-4] judges only the criteria of its kinds — a result for another kind cannot be parsed', async () => {
    const llm = fakeLlm({
      results: [result({ criterionId: 'c2', locationRefs: [] })],
      advisoryVerdict: 'accept',
    });
    const mustOnly = createLlmEvaluator<TinyOutput>(
      { ...definition.evaluators[0], criterionKinds: ['must'] },
      [llm],
    );
    expect((await mustOnly.run(ctx))[0].diagnostic?.reason).toBe('llm-failed');

    const niceOnly = createLlmEvaluator<TinyOutput>(
      { ...definition.evaluators[0], criterionKinds: ['nice'] },
      [llm],
    );
    expect((await niceOnly.run(ctx))[0].report).toMatchObject({
      evaluatorId: 'evaluator.tiny',
      sample: 1,
      advisoryVerdict: 'accept',
    });
  });

  it('[QL-4] with no criteria of its kinds it is not applicable', async () => {
    const evaluator = createLlmEvaluator<TinyOutput>(
      { ...definition.evaluators[0], criterionKinds: ['nice'] },
      [fakeLlm()],
    );
    const outcomes = await evaluator.run({
      ...ctx,
      contract: { ...ctx.contract, criteria: [criterion('c1')] },
    });
    expect(outcomes).toEqual([
      { report: null, diagnostic: expect.objectContaining({ reason: 'not-applicable' }) },
    ]);
  });
});
