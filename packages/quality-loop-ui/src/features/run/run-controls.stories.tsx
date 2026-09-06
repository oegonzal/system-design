import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { makePipeline, PROMPT_ENTRIES } from '../../testing/fixtures';
import { RunControls } from './run-controls';

const meta: Meta<typeof RunControls> = {
  title: 'Quality Loop/RunControls',
  component: RunControls,
  args: {
    prompts: PROMPT_ENTRIES,
    pipelines: [makePipeline()],
    value: { promptId: 'order-history', pipelineId: 'system-design', iterations: 1 },
    onChange: fn(),
    onRun: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof RunControls>;

export const Default: Story = {};

/** While a run is starting or in flight. */
export const Disabled: Story = { args: { disabled: true } };
