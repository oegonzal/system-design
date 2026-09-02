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

/** An evaluator that answered in ordinals: level + rationale per factor. */
export const WorkabilityFactors: Story = {
  args: {
    axes: [
      makeAxis({
        id: 'workability',
        label: 'Business workability',
        score: 73,
        subScores: null,
        summary: 'Model the dispute path next.',
        factors: [
          {
            id: 'objectiveAlignment',
            label: 'Objective alignment',
            level: 'high',
            rationale: 'The read model serves the account page the prompt names.',
          },
          {
            id: 'completeness',
            label: 'Completeness',
            level: 'medium',
            rationale: 'Refund amendment is modelled; disputes and partial refunds are not.',
          },
          {
            id: 'feasibility',
            label: 'Feasibility',
            level: 'high',
            rationale: 'Every declared flow runs as drawn.',
          },
          {
            id: 'risk',
            label: 'Remaining risk',
            level: 'low',
            rationale: 'Webhook replay duplicates remain the main exposure.',
          },
          {
            id: 'futureGain',
            label: 'Future gain',
            level: 'medium',
            rationale: 'The event stream leaves room for rewards and analytics consumers.',
          },
        ],
      }),
    ],
    scenarios: [],
  },
};
