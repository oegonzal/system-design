import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { PROFILE } from '../../testing/fixtures';
import { DEFAULT_LEAD_FILTERS, LeadFiltersControls } from './lead-filters';

const meta: Meta<typeof LeadFiltersControls> = {
  title: 'Govcon/LeadFilters',
  component: LeadFiltersControls,
  args: {
    value: { ...DEFAULT_LEAD_FILTERS, minScore: 40 },
    onChange: fn(),
    naicsChoices: PROFILE.naics,
  },
};
export default meta;

type Story = StoryObj<typeof LeadFiltersControls>;

/** A floor of 40, any tier, the profile's codes as chips. */
export const Default: Story = {};

/** One chip pressed, the high tier, a deadline horizon, ten rows. */
export const Narrowed: Story = {
  args: {
    value: {
      ...DEFAULT_LEAD_FILTERS,
      naics: '332710',
      tier: 'high',
      setAside: 'SBA',
      noticeTypes: ['Solicitation'],
      agency: 'DLA',
      q: 'bracket',
      deadlineWithinDays: 30,
      limit: 10,
    },
  },
};

/** The two types a buyer posts before it solicits, as the preset presses them. */
export const EarlyNotices: Story = {
  args: {
    value: { ...DEFAULT_LEAD_FILTERS, noticeTypes: ['Sources Sought', 'Presolicitation'] },
  },
};

/** No profile codes to offer. */
export const NoChips: Story = { args: { naicsChoices: [] } };
