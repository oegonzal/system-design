import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { PIPELINE_ROWS } from '../../testing/pipeline-fixtures';
import { PipelineTable } from './pipeline-table';

const NOW = Date.parse('2026-09-26T12:00:00Z');

const meta: Meta<typeof PipelineTable> = {
  title: 'Govcon/Pipeline/PipelineTable',
  component: PipelineTable,
  args: {
    rows: PIPELINE_ROWS,
    total: 3,
    limit: 50,
    offset: 0,
    nowMs: NOW,
    onStageChange: fn(),
    onEdit: fn(),
    onSave: fn(),
    onRemove: fn(),
    onPage: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof PipelineTable>;

/** Three tracked notices, one reminder due, stages editable in place. */
export const Default: Story = {};

/** A second page of a longer pipeline. */
export const Paged: Story = { args: { total: 120, offset: 50 } };

/** One bid open under its row: the stage, reminder, estimate and notes are written from there. */
export const Editing: Story = { args: { editing: PIPELINE_ROWS[0]?.bid.noticeId ?? null } };

/** The service refused the write: the open bid says why and keeps what was typed. */
export const Refused: Story = {
  args: {
    editing: PIPELINE_ROWS[0]?.bid.noticeId ?? null,
    error: 'estimatedValue: must not be negative',
  },
};

/** A stage being written: the selects wait. */
export const Saving: Story = { args: { saving: PIPELINE_ROWS[0]?.bid.noticeId ?? null } };

/** Nothing tracked in this stage. */
export const Empty: Story = { args: { rows: [], total: 0 } };
