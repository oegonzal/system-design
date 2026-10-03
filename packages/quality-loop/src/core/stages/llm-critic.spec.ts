import { describe, expect, it } from 'vitest';

import { emptyUpstream, type LensContext } from '../ports';
import { criterion, fakeLlm, finding, runLens, tinyPipeline, type TinyOutput } from '../testing';
import { createLlmCritic } from './llm-critic';

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
});
