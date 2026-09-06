import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { RUN_SUMMARIES } from '../../testing/fixtures';
import { RecentRuns } from './recent-runs';

const meta: Meta<typeof RecentRuns> = {
  title: 'Quality Loop/RecentRuns',
  component: RecentRuns,
  args: { runs: RUN_SUMMARIES, activeRunId: RUN_SUMMARIES[1]?.runId ?? null, onSelect: fn() },
};
export default meta;

type Story = StoryObj<typeof RecentRuns>;

/** One live run, one sent back for revision, one accepted; the middle one is open. */
export const Default: Story = {};

export const Empty: Story = { args: { runs: [], activeRunId: null } };
