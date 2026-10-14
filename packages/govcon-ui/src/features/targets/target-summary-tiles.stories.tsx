import type { Meta, StoryObj } from '@storybook/react-vite';

import { TARGET_SUMMARY } from '../../testing/fixtures';
import { TargetSummaryTiles } from './target-summary-tiles';

const meta: Meta<typeof TargetSummaryTiles> = {
  title: 'Govcon/Targets/TargetSummaryTiles',
  component: TargetSummaryTiles,
  args: { summary: TARGET_SUMMARY },
};
export default meta;

type Story = StoryObj<typeof TargetSummaryTiles>;

/** Four firms and four awards, one of them due. */
export const Default: Story = {};
