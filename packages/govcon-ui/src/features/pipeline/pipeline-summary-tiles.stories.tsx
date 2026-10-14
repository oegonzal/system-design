import type { Meta, StoryObj } from '@storybook/react-vite';

import { PIPELINE_SUMMARY } from '../../testing/pipeline-fixtures';
import { PipelineSummaryTiles } from './pipeline-summary-tiles';

const meta: Meta<typeof PipelineSummaryTiles> = {
  title: 'Govcon/Pipeline/PipelineSummaryTiles',
  component: PipelineSummaryTiles,
  args: { summary: PIPELINE_SUMMARY },
};
export default meta;

type Story = StoryObj<typeof PipelineSummaryTiles>;

/** Three tracked notices across three stages, two due this week. */
export const Default: Story = {};
