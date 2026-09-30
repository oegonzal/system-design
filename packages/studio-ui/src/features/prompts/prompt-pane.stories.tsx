import type { Meta, StoryObj } from '@storybook/react-vite';

import { makePrompt } from '../../testing/fixtures';
import { PromptPane } from './prompt-pane';

const meta: Meta<typeof PromptPane> = {
  title: 'Studio/Prompts/PromptPane',
  component: PromptPane,
  args: { onDerive: () => undefined },
};
export default meta;

type Story = StoryObj<typeof PromptPane>;

/** The markdown as written, the criteria grouped by kind. */
export const Derived: Story = { args: { prompt: makePrompt() } };

/** A generated prompt whose rubric is still being derived. */
export const Normalizing: Story = {
  args: { prompt: makePrompt({ source: 'generated', criteria: [] }), deriving: true },
};

/** The grader was unavailable — the pane says so and offers to try again. */
export const GraderUnavailable: Story = {
  args: {
    prompt: makePrompt({ source: 'library', criteria: [] }),
    deriveError: 'Service Unavailable',
  },
};
