import type { Meta, StoryObj } from '@storybook/react-vite';

import { CALLS } from '../../testing/fixtures';
import { CallHistory } from './call-history';

const meta: Meta<typeof CallHistory> = {
  title: 'Govcon/CallHistory',
  component: CallHistory,
  args: { calls: CALLS, total: CALLS.length },
};
export default meta;

type Story = StoryObj<typeof CallHistory>;

/** A description and two searches, newest first. */
export const Default: Story = {};

/** A rate limit and a bad body among them. */
export const WithFailures: Story = {
  args: {
    calls: [
      {
        ...(CALLS[0] as (typeof CALLS)[number]),
        id: 'c9',
        outcome: 'rate-limited',
        status: 429,
        recordCount: null,
        error: 'rate limited — OVER_RATE_LIMIT',
      },
      {
        ...(CALLS[1] as (typeof CALLS)[number]),
        id: 'c8',
        outcome: 'invalid-response',
        status: 200,
        totalRecords: null,
        recordCount: null,
        error: 'body is not JSON',
      },
      ...CALLS,
    ],
    total: 5,
  },
};

/** Nothing asked yet. */
export const Empty: Story = { args: { calls: [], total: 0 } };
