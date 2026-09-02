import type { Meta, StoryObj } from '@storybook/react-vite';

import { makePrompt, makeWorkflowPrompt } from '../../testing/fixtures';
import { PromptPane } from './prompt-pane';

const meta: Meta<typeof PromptPane> = {
  title: 'Studio/Prompts/PromptPane',
  component: PromptPane,
};
export default meta;

type Story = StoryObj<typeof PromptPane>;

/** The standard prompt layout: scenario, FRs, NFRs with targets, scale card. */
export const Standard: Story = { args: { prompt: makePrompt() } };

/** An advanced, AI-enriched prompt with a longer requirement list. */
export const Advanced: Story = {
  args: {
    prompt: makePrompt({
      difficulty: 'advanced',
      llmEnriched: true,
      title: 'Design the multi-region on-sale checkout path',
      functionalRequirements: [
        'Users can view seat availability in near-real time',
        'Users can hold seats for a bounded window',
        'Confirmed orders are never double-sold',
        'Orders survive a full region failover',
        'Refunds reconcile within 24 hours',
      ],
      scaleTargets: {
        concurrentUsers: 900_000,
        requestsPerSecond: 120_000,
        readWriteRatio: '98:2',
        p99LatencyMs: 150,
        availabilityPct: '99.99',
        dataRetention: '7 years',
      },
    }),
  },
};

/** A workflow prompt: the business layer rendered beside the prose requirements. */
export const WorkflowPrompt: Story = {
  args: { prompt: makeWorkflowPrompt() },
};
