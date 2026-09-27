import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { DESCRIPTION, EXCLUDED_LEAD, makeLeadDetail } from '../../testing/fixtures';
import { LeadDetail } from './lead-detail';

const meta: Meta<typeof LeadDetail> = {
  title: 'Govcon/LeadDetail',
  component: LeadDetail,
  args: { lead: makeLeadDetail(), onFetchDescription: fn() },
};
export default meta;

type Story = StoryObj<typeof LeadDetail>;

/** A high lead with every point traced; the description not fetched yet. */
export const Default: Story = {};

/** The description was fetched once and is kept. */
export const WithDescription: Story = {
  args: { lead: makeLeadDetail({ description: DESCRIPTION }) },
};

/** The request is in flight. */
export const Fetching: Story = { args: { fetching: true } };

/** The budget refused the fetch; the button stays for tomorrow. */
export const BudgetSpent: Story = {
  args: { problem: 'The budget is spent: 10 of 10 requests used in the last 24 h.' },
};

/** A notice a gate removed: no score, the reason instead. */
export const Excluded: Story = {
  args: { lead: makeLeadDetail({ ...EXCLUDED_LEAD }) },
};
