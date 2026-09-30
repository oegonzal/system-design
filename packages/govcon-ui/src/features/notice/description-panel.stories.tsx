import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { DESCRIPTION } from '../../testing/fixtures';
import { DescriptionPanel } from './description-panel';

const meta: Meta<typeof DescriptionPanel> = {
  title: 'Govcon/Notice/DescriptionPanel',
  component: DescriptionPanel,
  args: { description: null, onFetch: fn() },
};
export default meta;

type Story = StoryObj<typeof DescriptionPanel>;

/** Not fetched yet: one click, one request. */
export const Default: Story = {};

/** The description was fetched once and is kept. */
export const Stored: Story = { args: { description: DESCRIPTION } };

/** The request is in flight. */
export const Fetching: Story = { args: { fetching: true } };

/** The budget refused the fetch; the button stays for tomorrow. */
export const BudgetSpent: Story = {
  args: { problem: 'The budget is spent: 10 of 10 requests used in the last 24 h.' },
};
