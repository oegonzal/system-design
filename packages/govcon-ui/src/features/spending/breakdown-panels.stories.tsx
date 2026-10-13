import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { BREAKDOWN } from '../../testing/spending-fixtures';
import { BreakdownControls, BreakdownList } from './breakdown-panels';

const meta: Meta<typeof BreakdownList> = {
  title: 'Govcon/Spending/Breakdown',
  component: BreakdownList,
  args: { breakdown: BREAKDOWN },
};
export default meta;

type Story = StoryObj<typeof BreakdownList>;

/** Five agencies over the fiscal year to date. */
export const List: Story = {};

/** More rows than the bound. */
export const Truncated: Story = { args: { breakdown: { ...BREAKDOWN, truncated: true } } };

export const Empty: Story = { args: { breakdown: { ...BREAKDOWN, total: 0, rows: [] } } };

/** The one filter row. */
export const Controls: Story = {
  render: () => (
    <BreakdownControls
      category="awarding_agency"
      onCategoryChange={fn()}
      preset="fytd"
      onPresetChange={fn()}
    />
  ),
};
