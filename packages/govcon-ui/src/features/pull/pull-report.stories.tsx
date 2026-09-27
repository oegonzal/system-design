import type { Meta, StoryObj } from '@storybook/react-vite';

import { makePullReport } from '../../testing/fixtures';
import { PullReport } from './pull-report';

const meta: Meta<typeof PullReport> = {
  title: 'Govcon/PullReport',
  component: PullReport,
  args: { report: makePullReport() },
};
export default meta;

type Story = StoryObj<typeof PullReport>;

/** One slice pulled, one served from the cache, then the budget stopped the rest. */
export const BudgetStopped: Story = {};

/** Every slice pulled, nothing stopped. */
export const AllPulled: Story = {
  args: {
    report: makePullReport({
      slices: makePullReport().slices.map((slice) => ({
        ...slice,
        outcome: 'ok',
        pages: 1,
        received: 1,
        inserted: 1,
        detail: null,
      })),
      spent: 4,
      budget: 10,
      stoppedBy: null,
    }),
  },
};

/** A rate limit ended the pull on its first slice. */
export const RateLimited: Story = {
  args: {
    report: makePullReport({
      slices: makePullReport().slices.map((slice, index) => ({
        ...slice,
        outcome: index === 0 ? 'error' : 'skipped',
        pages: 0,
        received: 0,
        inserted: 0,
        detail: index === 0 ? 'rate-limited: over quota' : 'stopped earlier: rate-limited',
      })),
      spent: 10,
      budget: 10,
      stoppedBy: 'rate-limited',
    }),
  },
};
