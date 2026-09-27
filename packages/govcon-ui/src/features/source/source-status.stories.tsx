import type { Meta, StoryObj } from '@storybook/react-vite';

import { DISABLED_SOURCE, SOURCE_STATUS } from '../../testing/fixtures';
import { SourceStatus } from './source-status';

const meta: Meta<typeof SourceStatus> = {
  title: 'Govcon/SourceStatus',
  component: SourceStatus,
  args: { status: SOURCE_STATUS },
};
export default meta;

type Story = StoryObj<typeof SourceStatus>;

/** Three of ten requests spent: comfortably green. */
export const Default: Story = {};

/** Nine of ten: the meter turns red before the last one. */
export const NearlySpent: Story = {
  args: { status: { ...SOURCE_STATUS, budget: { ...SOURCE_STATUS.budget, spent: 9 } } },
};

/** No key in the environment: the source says so instead of failing. */
export const Disabled: Story = { args: { status: DISABLED_SOURCE } };

/** The ledger could not be read: the budget is unknown, not zero. */
export const LedgerUnreadable: Story = {
  args: { status: { ...SOURCE_STATUS, budget: { ...SOURCE_STATUS.budget, spent: null } } },
};
