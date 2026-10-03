import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { bound, bounded, type ValidationReport } from '@sysdesign/contracts';

import { problem } from '../contracts';
import { emptyUpstream, type LensContext } from '../ports';
import { criterion, fakeLlm, finding, runLens, tinyPipeline, type TinyOutput } from '../testing';
import { createLlmCritic } from './llm-critic';
import { createBoundsValidator } from './schema-validator';

const definition = tinyPipeline();
const artifact: TinyOutput = { text: 't', parts: ['a'] };
const ctx: LensContext<TinyOutput> = {
  contract: { ...definition.task, goal: 'g', criteria: [criterion('c1')] },
  artifact,
  locations: definition.task.output.locate(artifact),
  rendered: definition.task.output.render(artifact),
  validation: [],
  upstream: emptyUpstream(),
};

describe('createLlmCritic', () => {
  it('[QL-4] [QL-46] a finding that cites an unlisted location cannot be parsed, so the sample is a diagnostic that keeps the fault', async () => {
    const critic = createLlmCritic(definition.critics[0], definition.task, [
      fakeLlm({ findings: [finding({ locationRefs: ['ghost'] })] }),
    ]);
    expect(await runLens(critic, ctx)).toEqual([
      {
        report: null,
        diagnostic: expect.objectContaining({
          stage: 'critic.tiny',
          sample: 1,
          reason: 'llm-failed',
          facts: {
            issues: [expect.objectContaining({ path: 'findings[0].locationRefs[0]', soft: false })],
          },
        }),
      },
    ]);
  });

  it('[QL-4] one outcome per sample, each on its own client', async () => {
    const good = fakeLlm({
      findings: [finding({ locationRefs: ['part.1'], criterionIds: ['c1'] })],
    });
    // The middle sample's model answers nothing: that sample is llm-failed, its neighbours report.
    const critic = createLlmCritic({ ...definition.critics[0], samples: 3 }, definition.task, [
      good,
      fakeLlm(),
      good,
    ]);
    const outcomes = await runLens(critic, ctx);
    expect(outcomes.map((outcome) => outcome.report?.sample ?? outcome.diagnostic?.reason)).toEqual(
      [1, 'llm-failed', 3],
    );
  });

  it('[QL-47] is told as already counted only what the controller acts on, so a field past its target leaves its prompt byte-identical', async () => {
    // The bounds validator over an artifact whose text runs past what was asked.
    const sized = z.strictObject({ text: bounded.text(bound(10)), parts: z.array(z.string()) });
    const over = createBoundsValidator<TinyOutput>().validate(
      { text: 'x'.repeat(20), parts: ['a'] },
      { ...ctx.contract, output: { ...ctx.contract.output, schema: sized } },
    );
    expect(over.problems).toEqual([expect.objectContaining({ severity: 'info' })]);
    const structure: ValidationReport = {
      validatorId: 'structure',
      gate: 'warn',
      problems: [problem('medium', 'part 1 repeats part 2')],
    };

    const promptWith = async (validation: ValidationReport[]): Promise<string> => {
      const prompts: string[] = [];
      const recorded = fakeLlm({ findings: [] }).withRecorder((call) =>
        prompts.push(`${call.system}\n${call.user}`),
      );
      await runLens(createLlmCritic(definition.critics[0], definition.task, [recorded]), {
        ...ctx,
        validation,
      });
      return prompts.join('\n');
    };
    const without = await promptWith([structure]);
    expect(without).toContain('- [structure] part 1 repeats part 2');
    expect(await promptWith([structure, over])).toBe(without);
  });
});
