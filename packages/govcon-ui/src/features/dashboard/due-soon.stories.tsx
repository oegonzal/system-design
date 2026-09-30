import type { Meta, StoryObj } from '@storybook/react-vite';

import { PIPELINE_ROWS } from '../../testing/fixtures';
import { DueSoon } from './due-soon';

const NOW = Date.parse('2026-09-26T12:00:00Z');

const meta: Meta<typeof DueSoon> = {
  title: 'Govcon/DueSoon',
  component: DueSoon,
  args: { rows: PIPELINE_ROWS, nowMs: NOW },
};
export default meta;

type Story = StoryObj<typeof DueSoon>;

/** Two of three tracked notices fall inside the week: one by reminder, one by deadline. */
export const Default: Story = {};

/** Nothing tracked comes due. */
export const Quiet: Story = { args: { rows: [], nowMs: NOW } };
