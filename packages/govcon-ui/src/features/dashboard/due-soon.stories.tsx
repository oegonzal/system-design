import type { Meta, StoryObj } from '@storybook/react-vite';

import { PIPELINE_ROWS, TARGETS } from '../../testing/pipeline-fixtures';
import { dueItemsOf } from './due-items';
import { DueSoon } from './due-soon';

const NOW = Date.parse('2026-09-26T12:00:00Z');

const meta: Meta<typeof DueSoon> = {
  title: 'Govcon/DueSoon',
  component: DueSoon,
  args: { items: dueItemsOf(PIPELINE_ROWS, TARGETS, NOW) },
};
export default meta;

type Story = StoryObj<typeof DueSoon>;

/** Two tracked notices — one by reminder, one by deadline — and a firm by its reminder fall inside the week. */
export const Default: Story = {};

/** Nothing tracked comes due. */
export const Quiet: Story = { args: { items: [] } };
