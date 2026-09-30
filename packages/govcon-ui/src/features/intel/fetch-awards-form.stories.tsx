import type { FetchAwardsReport } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { PROFILE } from '../../testing/fixtures';
import { FetchAwardsForm } from './fetch-awards-form';

export const FETCH_REPORT: FetchAwardsReport = {
  slices: [
    {
      source: 'sam.gov',
      code: '332710',
      outcome: 'ok',
      pages: 1,
      received: 5,
      inserted: 5,
      updated: 0,
      truncated: false,
      detail: null,
    },
    {
      source: 'sam.gov',
      code: '541511',
      outcome: 'budget-exhausted',
      pages: 0,
      received: 0,
      inserted: 0,
      updated: 0,
      truncated: false,
      detail: 'budget 1000/1000 spent',
    },
    {
      source: 'usaspending',
      code: '332710,541511',
      outcome: 'ok',
      pages: 3,
      received: 300,
      inserted: 280,
      updated: 20,
      truncated: true,
      detail: 'more pages beyond 3',
    },
  ],
  spent: 1000,
  budget: 1000,
};

const meta: Meta<typeof FetchAwardsForm> = {
  title: 'Govcon/Intel/FetchAwardsForm',
  component: FetchAwardsForm,
  args: { defaultNaics: PROFILE.naics, onFetch: fn() },
};
export default meta;

type Story = StoryObj<typeof FetchAwardsForm>;

/** The profile's codes, a year back, both sources — each with its cost. */
export const Default: Story = {};

/** After a fetch: what each slice did. */
export const WithReport: Story = { args: { report: FETCH_REPORT } };

/** In flight. */
export const Pending: Story = { args: { pending: true } };
