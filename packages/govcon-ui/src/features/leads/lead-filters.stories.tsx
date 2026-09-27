import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { LeadFiltersControls } from './lead-filters';

const meta: Meta<typeof LeadFiltersControls> = {
  title: 'Govcon/LeadFilters',
  component: LeadFiltersControls,
  args: { value: { minScore: 40, tier: null, limit: 25 }, onChange: fn() },
};
export default meta;

type Story = StoryObj<typeof LeadFiltersControls>;

/** A floor of 40, any tier, 25 rows. */
export const Default: Story = {};

/** Only the high tier. */
export const HighOnly: Story = { args: { value: { minScore: 0, tier: 'high', limit: 10 } } };
