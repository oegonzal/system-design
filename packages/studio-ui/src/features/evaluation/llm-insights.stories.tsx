import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeAxis, makeScenarioReport } from '../../testing/fixtures';
import { LlmInsights } from './llm-insights';

const meta: Meta<typeof LlmInsights> = {
  title: 'Studio/Evaluation/LlmInsights',
  component: LlmInsights,
};
export default meta;

type Story = StoryObj<typeof LlmInsights>;

/** The full advisory layer: a scored depth axis plus three scenario verdicts. */
export const DepthAndScenarios: Story = {
  args: {
    axes: [makeAxis()],
    scenarios: [
      makeScenarioReport({ verdict: 'survives', story: 'The waiting room meters the herd in.' }),
      makeScenarioReport({
        scenarioId: 'hot-partition',
        title: 'One event takes all the writes',
        verdict: 'degrades',
        story: 'The order queue backs up but drains within the window.',
      }),
      makeScenarioReport({
        scenarioId: 'region-loss',
        title: 'A region disappears',
        verdict: 'fails',
        story: 'Single-region: the on-sale goes down with the region.',
      }),
    ],
  },
};

/** The model critic was unavailable — the axis says so instead of guessing. */
export const Unscored: Story = {
  args: {
    axes: [makeAxis({ score: null, subScores: null, summary: null, model: null })],
    scenarios: [],
  },
};
