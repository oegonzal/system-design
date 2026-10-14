import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { FIRM_TARGET, TARGET, TARGETS } from '../../testing/fixtures';
import { TargetsTable } from './targets-table';

const meta: Meta<typeof TargetsTable> = {
  title: 'Govcon/Targets/TargetsTable',
  component: TargetsTable,
  args: {
    rows: TARGETS,
    total: 2,
    limit: 50,
    offset: 0,
    nowMs: Date.parse('2026-09-27T12:00:00Z'),
    onStageChange: fn(),
    onEdit: fn(),
    onSave: fn(),
    onRemove: fn(),
    onPage: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof TargetsTable>;

/** A tracked award and a tracked firm, the firm due in two days. */
export const Default: Story = {};

/** The firm's row open: the whole of it under the row. */
export const Editing: Story = { args: { editing: FIRM_TARGET.id } };

/** One page of several. */
export const Paged: Story = { args: { rows: [TARGET], total: 120, limit: 1, offset: 1 } };

export const Empty: Story = { args: { rows: [], total: 0 } };
